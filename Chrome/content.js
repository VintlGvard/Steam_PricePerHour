(() => {
  "use strict";

  const CACHE_PREFIX = "spph_cache_v3_";
  const CACHE_NOTFOUND = "spph_nf_v3_";
  const CACHE_PREFIX_LEGACY = "hltb_cache_v3_";
  const CACHE_NOTFOUND_LEGACY = "hltb_nf_v3_";
  const TTL_FOUND = 7 * 24 * 60 * 60 * 1000;
  const TTL_NOTFOUND = 48 * 60 * 60 * 1000;

  const REQUEST_DELAY_MS = 400;
  const OBSERVER_DEBOUNCE_MS = 350;
  const INITIAL_DELAY_MS = 1500;

  const SETTINGS_KEY = "spph_settings";
  const SETTINGS_KEY_LEGACY = "hltb_settings";
  const DEFAULT_SETTINGS = {
    enabled: true,
    valueMode: "main",
    acceptablePrice: 20,
    language: "en",
  };
  let _settings = { ...DEFAULT_SETTINGS };

  function clampSetting(val, min, max) {
    const n = Number(val);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function parseSettings(raw) {
    const VALID_MODES = ["main", "plus", "completionist"];

    const legacyFallback = clampSetting(
      raw.targetThreshold ?? raw.targetRubThreshold ?? raw.goodRubThreshold ?? DEFAULT_SETTINGS.acceptablePrice,
      0,
      1000000,
    );
    let acceptablePrice;
    if (raw.acceptablePrice != null) {
      acceptablePrice = clampSetting(raw.acceptablePrice, 0, 1000000);
    } else if (raw.normalTo != null) {
      acceptablePrice = clampSetting(raw.normalTo, 0, 1000000);
    } else {
      acceptablePrice = legacyFallback;
    }

    let mode = VALID_MODES.includes(raw.valueMode) ? raw.valueMode : null;
    if (!mode) {
      if (raw.showCompletionist === true) {
        mode = "completionist";
      } else if (raw.showPlus !== false) {
        mode = "plus";
      } else {
        mode = "main";
      }
    }
    const VALID_LANGUAGES = ["ru", "en"];
    return {
      enabled: raw.enabled !== false,
      valueMode: mode,
      acceptablePrice,
      language: VALID_LANGUAGES.includes(raw.language)
        ? raw.language
        : (isRu ? "ru" : "en"),
    };
  }

  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get([SETTINGS_KEY, SETTINGS_KEY_LEGACY]);
      const raw = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === "object"
        ? data[SETTINGS_KEY]
        : data[SETTINGS_KEY_LEGACY] && typeof data[SETTINGS_KEY_LEGACY] === "object"
          ? data[SETTINGS_KEY_LEGACY]
          : null;
      if (raw) {
        _settings = parseSettings(raw);
      }
    } catch {
    }
  }

  const SELECTORS = {
    searchRow: ".search_result_row",
    saleCapsule: "a.sale_capsule_target",
    spotlight: ".home_area_spotlight",
    discountFallback: ".discount_prices",
    appPurchaseWrapper: ".game_area_purchase_game_wrapper",
    appPurchaseGame: ".game_area_purchase_game",
    dlcRow: ".game_area_dlc_row[data-ds-appid]",
  };

  const CURRENCY_TOKENS = [
    ["R$", "BRL"],
    ["zł", "PLN"],
    ["CHF", "CHF"],
    ["kr", "SEK"],
    ["₽", "RUB"],
    ["$", "USD"],
    ["€", "EUR"],
    ["£", "GBP"],
    ["¥", "JPY"],
    ["₴", "UAH"],
    ["₸", "KZT"],
    ["₹", "INR"],
    ["₩", "KRW"],
    ["₺", "TRY"],
    ["R", "ZAR"],
  ];
  const CURRENCY_CODES = [
    "RUB", "USD", "EUR", "GBP", "JPY", "UAH", "KZT", "INR",
    "PLN", "BRL", "CHF", "SEK", "TRY", "ZAR", "KRW", "CNY",
    "AUD", "CAD", "NZD", "CZK", "HUF", "NOK", "DKK", "THB",
    "IDR", "MYR", "PHP", "SGD", "HKD", "TWD", "MXN",
  ];

  function matchesCurrencyToken(text, token) {
    if (/^[a-zA-Z]+$/.test(token)) {
      return new RegExp("\\b" + token + "\\b", "i").test(text);
    }
    return text.includes(token);
  }

  const isRu = /^ru/.test(navigator.language || "");

  function getLabels() {
    const lang = _settings.language;
    if (lang === "ru") {
      return {
        hr: "\u0447",
        story: "\u0421\u044E\u0436\u0435\u0442",
        plus: "\u0421\u044E\u0436\u0435\u0442 + \u0434\u043E\u043F.",
        completionist: "100%",
        free: "\u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E",
      };
    }
    return { hr: "h", story: "Story", plus: "Main + Extra", completionist: "100%", free: "free" };
  }

  function normalizeName(raw) {
    if (!raw) return "";
    return raw
      .replace(/[\u2122\u00AE\u00A9]/g, "")
      .replace(/[:;!\?\.\-,\/\\'"„"«»–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function firstNumber(...vals) {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  function numericId(val) {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function levenshtein(a, b, maxDist) {
    if (maxDist == null) maxDist = 6;
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
        if (i > 1 && j > 1) {
          dp[i][j] = Math.min(
            dp[i][j],
            dp[i - 2][j - 2] +
              (a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? 0 : 2),
          );
        }
      }
    }
    return dp[m][n];
  }

  function tokenSimilarity(nameA, nameB) {
    const tokA = new Set(nameA.split(/\s+/).filter(Boolean));
    const tokB = new Set(nameB.split(/\s+/).filter(Boolean));
    if (tokA.size === 0 || tokB.size === 0) return 0;
    let inter = 0;
    for (const t of tokA) if (tokB.has(t)) inter++;
    const union = tokA.size + tokB.size - inter;
    const jaccard = union > 0 ? inter / union : 0;
    const lenRatio =
      Math.min(nameA.length, nameB.length) /
      Math.max(nameA.length, nameB.length);
    return 0.6 * jaccard + 0.4 * lenRatio;
  }

  function matchScore(queryNorm, game) {
    const names = [
      game.game_name,
      game.comp_name,
      game.game_alias,
      game.alias,
    ].filter(Boolean);
    let best = -1;
    for (const name of names) {
      const candNorm = normalizeName(name);
      if (!candNorm) continue;
      if (candNorm === queryNorm) return 1000;
      const ts = tokenSimilarity(queryNorm, candNorm);
      if (ts >= 0.6) {
        best = Math.max(best, ts * 100);
        continue;
      }
      const maxLen = Math.max(queryNorm.length, candNorm.length, 1);
      const dist = levenshtein(queryNorm, candNorm, maxLen);
      if (dist / maxLen <= 0.25) {
        best = Math.max(best, (1 - dist / maxLen) * 80);
      }
    }
    return best;
  }

  function findBestMatch(queryNorm, results, steamAppId) {
    if (steamAppId) {
      const target = numericId(steamAppId);
      if (target) {
        for (const r of results) {
          if (
            numericId(r.profile_steam) === target ||
            numericId(r.profile_steam_alt) === target
          ) {
            return r;
          }
        }
      }
    }

    let bestGame = null;
    let bestScore = -1;
    for (const r of results) {
      const s = matchScore(queryNorm, r);
      if (s > bestScore) {
        bestScore = s;
        bestGame = r;
      }
    }
    return bestScore >= 0 ? bestGame : null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function cacheKey(name) {
    return CACHE_PREFIX + normalizeName(name);
  }
  function nfKey(name) {
    return CACHE_NOTFOUND + normalizeName(name);
  }
  function cacheKeyLegacy(name) {
    return CACHE_PREFIX_LEGACY + normalizeName(name);
  }
  function nfKeyLegacy(name) {
    return CACHE_NOTFOUND_LEGACY + normalizeName(name);
  }

  async function getCache(name) {
    const keys = [cacheKey(name), cacheKeyLegacy(name)];
    for (const key of keys) {
      try {
        const data = await chrome.storage.local.get([key]);
        const entry = data[key];
        if (!entry || !entry.timestamp) continue;
        if (Date.now() - entry.timestamp > TTL_FOUND) continue;
        if (entry.main === null && entry.plus === null) continue;
        return entry;
      } catch {
        continue;
      }
    }
    return null;
  }

  async function setCache(name, main, plus, completionist) {
    try {
      await chrome.storage.local.set({
        [cacheKey(name)]: { main, plus, completionist: completionist || 0, timestamp: Date.now() },
      });
    } catch {
    }
  }

  async function getNotFound(name) {
    const keys = [nfKey(name), nfKeyLegacy(name)];
    for (const key of keys) {
      try {
        const data = await chrome.storage.local.get([key]);
        const entry = data[key];
        if (!entry || !entry.timestamp) continue;
        if (Date.now() - entry.timestamp < TTL_NOTFOUND) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async function markNotFound(name) {
    try {
      await chrome.storage.local.set({
        [nfKey(name)]: { timestamp: Date.now() },
      });
    } catch {
    }
  }

  const _queue = [];
  const _inflight = new Map();
  let _busy = false;

  function enqueue(name, steamAppId) {
    const norm = normalizeName(name);
    if (_inflight.has(norm)) {
      return _inflight.get(norm);
    }
    const promise = new Promise((resolve, reject) => {
      _queue.push({ name, steamAppId, norm, resolve, reject });
      drainQueue();
    });
    _inflight.set(norm, promise);
    promise.finally(() => {
      _inflight.delete(norm);
    });
    return promise;
  }

  async function drainQueue() {
    if (_busy || _queue.length === 0) return;
    _busy = true;
    while (_queue.length > 0) {
      const job = _queue.shift();
      if (!_settings.enabled) {
        job.resolve(null);
        continue;
      }
      try {
        job.resolve(await fetchSPPH(job.name, job.steamAppId));
      } catch (err) {
        job.reject(err);
      }
      if (_queue.length > 0) await sleep(REQUEST_DELAY_MS);
    }
    _busy = false;
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

  function toHours(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 200 ? +n.toFixed(2) : +(n / 3600).toFixed(2);
  }

  function fmtH(h) {
    return Number(h).toFixed(2);
  }

  async function fetchSPPH(gameName, steamAppId) {
    if (await getNotFound(gameName)) {
      return null;
    }
    const cached = await getCache(gameName);
    if (cached) {
      return cached;
    }

    if (!_settings.enabled) {
      return null;
    }

    const msgType = steamAppId ? "spphBySteamApp" : "spphSearch";

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: msgType,
        gameName,
        steamAppId: steamAppId || null,
      });
    } catch {
      response = null;
    }

    if (response && response.errorCode === "steam_not_open") {
      return null;
    }

    if (!response || !response.ok) {
      return null;
    }

    if (response.data && !Array.isArray(response.data) && response.data.game_id) {
      const best = response.data;
      const mainH = toHours(firstNumber(best.comp_main, best.mainStory, best.main));
      const plusH = toHours(
        firstNumber(best.comp_plus, best.mainExtra, best.main_extra, best.extra),
      );
      const compH = toHours(
        firstNumber(best.comp_100, best.comp_complete, best.completionist, best.all_styles),
      );
      if (mainH === 0 && plusH === 0) {
        if (response.errorCode === "empty_results" || response.errorCode === "not_found_by_steam_app") {
          await markNotFound(gameName);
        }
        return null;
      }
      await setCache(gameName, mainH, plusH, compH);
      return { main: mainH, plus: plusH, completionist: compH };
    }

    const results = Array.isArray(response.data) ? response.data : extractResults(response.data);

    if (!results.length) {
      if (response.errorCode === "empty_results" || response.errorCode === "not_found_by_steam_app") {
        await markNotFound(gameName);
      }
      return null;
    }

    const queryNorm = normalizeName(gameName);
    const best = findBestMatch(queryNorm, results, steamAppId);

    if (!best) {
      if (response.errorCode === "empty_results" || response.errorCode === "not_found_by_steam_app") {
        await markNotFound(gameName);
      }
      return null;
    }

    const mainH = toHours(firstNumber(best.comp_main, best.mainStory, best.main));
    const plusH = toHours(
      firstNumber(best.comp_plus, best.mainExtra, best.main_extra, best.extra),
    );
    const compH = toHours(
      firstNumber(best.comp_100, best.comp_complete, best.completionist, best.all_styles),
    );
    const result = { main: mainH, plus: plusH, completionist: compH };
    await setCache(gameName, mainH, plusH, compH);
    return result;
  }

  function parsePriceText(text) {
    let currencySymbol = "";
    let currencyCode = "";

    for (const [sym, code] of CURRENCY_TOKENS) {
      if (matchesCurrencyToken(text, sym)) {
        currencySymbol = sym;
        currencyCode = code;
        break;
      }
    }
    if (!currencyCode) {
      for (const code of CURRENCY_CODES) {
        if (new RegExp("\\b" + code + "\\b", "i").test(text)) {
          currencyCode = code;
          break;
        }
      }
    }

    const formattedCurrency = currencySymbol || currencyCode || "\u00A4";

    let numText = text;
    if (currencySymbol) numText = numText.split(currencySymbol).join("");
    if (currencyCode)
      numText = numText.replace(new RegExp(currencyCode, "gi"), "");
    numText = numText.replace(/\s/g, "").replace(/[^0-9.,]/g, "");
    if (!numText) return null;

    const lastComma = numText.lastIndexOf(",");
    const lastDot = numText.lastIndexOf(".");

    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) {
        numText = numText.replace(/\./g, "").replace(",", ".");
      } else {
        numText = numText.replace(/,/g, "");
      }
    } else if (lastComma >= 0) {
      const trailing = numText.length - lastComma - 1;
      if (trailing <= 2) {
        numText =
          numText.substring(0, lastComma) +
          "." +
          numText.substring(lastComma + 1);
        numText = numText.replace(/,/g, "");
      } else {
        numText = numText.replace(/,/g, "");
      }
    } else if (lastDot >= 0) {
      const trailing = numText.length - lastDot - 1;
      if (trailing > 2) numText = numText.replace(/\./g, "");
    }

    const amount = parseFloat(numText);
    if (!Number.isFinite(amount) || amount < 0) return null;

    return {
      amount,
      currencySymbol,
      currencyCode,
      formattedCurrency,
      isFree: false,
    };
  }

  function extractPrice(card) {
    const freeCheck = (txt) => /free/i.test(txt);

    if (card.matches(".game_area_dlc_row")) {
      const dlcPriceEl = card.querySelector(".game_area_dlc_price");
      if (dlcPriceEl) {
        const txt = dlcPriceEl.textContent.trim();
        if (freeCheck(txt)) return { amount: 0, currencySymbol: "", currencyCode: "", formattedCurrency: "", isFree: true };
        const parsed = parsePriceText(txt);
        if (parsed) return parsed;
      }
      return null;
    }

    const discountBlock = card.querySelector(".discount_prices");
    if (discountBlock) {
      const finalEl = discountBlock.querySelector(".discount_final_price");
      if (finalEl) {
        const txt = finalEl.textContent.trim();
        if (freeCheck(txt))
          return {
            amount: 0,
            currencySymbol: "",
            currencyCode: "",
            formattedCurrency: "",
            isFree: true,
          };
        const parsed = parsePriceText(txt);
        if (parsed) return parsed;
      }
    }

    const regularEl = card.querySelector(".game_purchase_price");
    if (regularEl) {
      const txt = regularEl.textContent.trim();
      if (freeCheck(txt))
        return {
          amount: 0,
          currencySymbol: "",
          currencyCode: "",
          formattedCurrency: "",
          isFree: true,
        };
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }

    const searchEl = card.querySelector(".search_price");
    if (searchEl) {
      const searchFinal = searchEl.querySelector(".discount_final_price");
      if (searchFinal) {
        const finalTxt = searchFinal.textContent.trim();
        if (freeCheck(finalTxt))
          return {
            amount: 0,
            currencySymbol: "",
            currencyCode: "",
            formattedCurrency: "",
            isFree: true,
          };
        const finalParsed = parsePriceText(finalTxt);
        if (finalParsed) return finalParsed;
      }
      const txt = searchEl.textContent.trim();
      if (freeCheck(txt))
        return {
          amount: 0,
          currencySymbol: "",
          currencyCode: "",
          formattedCurrency: "",
          isFree: true,
        };
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }

    const dataPriceEl = card.querySelector("[data-price-final]");
    if (dataPriceEl) {
      const hqEl = dataPriceEl.querySelector("[class*=\"HQzBzl6lqI\"]");
      if (hqEl) {
        const txt = hqEl.textContent.trim();
        if (freeCheck(txt))
          return {
            amount: 0,
            currencySymbol: "",
            currencyCode: "",
            formattedCurrency: "",
            isFree: true,
          };
        const parsed = parsePriceText(txt);
        if (parsed) return parsed;
      }
      const cjEl = dataPriceEl.querySelector("[class*=\"Cj7J5QHbL\"]");
      if (cjEl) {
        const txt = cjEl.textContent.trim();
        if (freeCheck(txt))
          return {
            amount: 0,
            currencySymbol: "",
            currencyCode: "",
            formattedCurrency: "",
            isFree: true,
          };
        const parsed = parsePriceText(txt);
        if (parsed) return parsed;
      }
      const selfTxt = dataPriceEl.textContent.trim();
      if (selfTxt) {
        if (freeCheck(selfTxt))
          return {
            amount: 0,
            currencySymbol: "",
            currencyCode: "",
            formattedCurrency: "",
            isFree: true,
          };
        const parsed = parsePriceText(selfTxt);
        if (parsed) return parsed;
      }
      const minorUnits = Number(dataPriceEl.getAttribute("data-price-final"));
      if (Number.isFinite(minorUnits)) {
        if (minorUnits === 0) {
          return {
            amount: 0,
            currencySymbol: "",
            currencyCode: "",
            formattedCurrency: "",
            isFree: true,
          };
        }
        const attrCurrency = (dataPriceEl.getAttribute("data-price-currency") || "").toUpperCase();
        const minorUnitMap = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, RWF: 0, PYG: 0, VUV: 0, BHD: 3, KWD: 3, OMR: 3 };
        if (attrCurrency && attrCurrency in minorUnitMap) {
          const dec = minorUnitMap[attrCurrency];
          return {
            amount: dec === 0 ? minorUnits : minorUnits / Math.pow(10, dec),
            currencySymbol: "",
            currencyCode: attrCurrency,
            formattedCurrency: attrCurrency,
            isFree: false,
          };
        }
        if (attrCurrency) {
          return {
            amount: minorUnits / 100,
            currencySymbol: "",
            currencyCode: attrCurrency,
            formattedCurrency: attrCurrency,
            isFree: false,
          };
        }
        return {
          amount: minorUnits,
          currencySymbol: "",
          currencyCode: "",
          formattedCurrency: "\u00A4",
          isFree: false,
        };
      }
    }

    if (/free\s*to\s*play/i.test(card.textContent)) {
      return {
        amount: 0,
        currencySymbol: "",
        currencyCode: "",
        formattedCurrency: "",
        isFree: true,
      };
    }

    return null;
  }

  function extractSteamAppId(card) {
    const anchors = card.querySelectorAll("a[href*='/app/']");
    for (const a of anchors) {
      const m = a.href.match(/\/app\/(\d+)/);
      if (m) return m[1];
    }
    if (card.tagName === "A" && card.href) {
      const m = card.href.match(/\/app\/(\d+)/);
      if (m) return m[1];
    }
    const appIdAttr = card.getAttribute("data-ds-appid") ||
      card.getAttribute("data-appid");
    if (appIdAttr) return appIdAttr;
    return null;
  }

  function isAppPage() {
    return /\/app\/\d+/.test(location.pathname);
  }

  function isBundlePage() {
    return /\/bundle\/\d+/.test(location.pathname);
  }

  function extractAppPageAppId(wrapper) {
    if (wrapper) {
      const fromWrapper = extractSteamAppId(wrapper);
      if (fromWrapper) return fromWrapper;
    }
    const m = location.pathname.match(/\/app\/(\d+)/);
    return m ? m[1] : null;
  }

  function extractAppPageTitle() {
    let el = document.querySelector(".apphub_AppName");
    if (el) {
      const t = el.textContent.trim();
      if (t) return t;
    }
    el = document.querySelector("h1");
    if (el) {
      const t = el.textContent.trim();
      if (t) return t;
    }
    const og = document.querySelector('meta[property="og:title"]');
    if (og) {
      const c = og.getAttribute("content");
      if (c) return c.trim();
    }
    if (document.title) {
      return document.title
        .replace(/\s*[:\-–—]\s*Steam.*$/i, "")
        .replace(/\s*on\s+Steam\s*$/i, "")
        .trim();
    }
    return null;
  }

  function extractBundlePrice(wrapper) {
    const freeCheck = (txt) => /free/i.test(txt);
    const freePriceObj = {
      amount: 0, currencySymbol: "", currencyCode: "",
      formattedCurrency: "", isFree: true,
    };

    const yourPrice = wrapper.querySelector(".your_price");
    if (yourPrice) {
      const finalInYour = yourPrice.querySelector(".discount_final_price");
      if (finalInYour) {
        const txt = finalInYour.textContent.trim();
        if (freeCheck(txt)) return freePriceObj;
        const parsed = parsePriceText(txt);
        if (parsed) return parsed;
      }
      const priceInYour = yourPrice.querySelector(".game_purchase_price");
      if (priceInYour) {
        const txt = priceInYour.textContent.trim();
        if (freeCheck(txt)) return freePriceObj;
        const parsed = parsePriceText(txt);
        if (parsed) return parsed;
      }
    }

    const discFinal = wrapper.querySelector(".discount_final_price");
    if (discFinal) {
      const txt = discFinal.textContent.trim();
      if (freeCheck(txt)) return freePriceObj;
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }

    const regular = wrapper.querySelector(".game_purchase_price");
    if (regular) {
      const txt = regular.textContent.trim();
      if (freeCheck(txt)) return freePriceObj;
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }

    const dataEl = wrapper.querySelector("[data-price-final]");
    if (dataEl) {
      const minorUnits = Number(dataEl.getAttribute("data-price-final"));
      if (minorUnits === 0) return freePriceObj;
      if (Number.isFinite(minorUnits)) {
        const attrCurrency = (dataEl.getAttribute("data-price-currency") || "").toUpperCase();
        const minorUnitMap = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, RWF: 0, PYG: 0, VUV: 0, BHD: 3, KWD: 3, OMR: 3 };
        if (attrCurrency && attrCurrency in minorUnitMap) {
          const dec = minorUnitMap[attrCurrency];
          return {
            amount: dec === 0 ? minorUnits : minorUnits / Math.pow(10, dec),
            currencySymbol: "", currencyCode: attrCurrency,
            formattedCurrency: attrCurrency, isFree: false,
          };
        }
        if (attrCurrency) {
          return {
            amount: minorUnits / 100, currencySymbol: "", currencyCode: attrCurrency,
            formattedCurrency: attrCurrency, isFree: false,
          };
        }
        return {
          amount: minorUnits, currencySymbol: "", currencyCode: "",
          formattedCurrency: "\u00A4", isFree: false,
        };
      }
    }

    return null;
  }

  function extractTitle(card) {
    if (card.matches(".game_area_dlc_row")) {
      const dlcNameEl = card.querySelector(".game_area_dlc_name");
      if (dlcNameEl) {
        const clone = dlcNameEl.cloneNode(true);
        const highlightReason = clone.querySelector(".dlc_highlight_reason");
        if (highlightReason) highlightReason.remove();
        const txt = clone.textContent.trim();
        if (txt) return txt;
      }
    }

    let el = card.querySelector(".title, .search_name, .I8vuMMV-osE-, a[class*='I8vuMMV']");
    if (!el)
      el = card.querySelector("a[href*='/app/'] .title");
    if (!el) el = card.querySelector(".discount_name");
    if (!el) el = card.querySelector("h4, h3, .game_name, [class*='name']");
    if (!el) {
      const img = card.querySelector("a[href*='/app/'] img[alt]");
      if (img) {
        const alt = img.getAttribute("alt");
        if (alt && alt.trim()) return alt.trim();
      }
    }
    if (!el) {
      const a = card.querySelector("a[href*='/app/']");
      if (a) {
        const label = a.getAttribute("aria-label") || a.getAttribute("title");
        if (label && label.trim()) return label.trim();
        for (const child of a.children) {
          const txt = child.textContent.trim();
          if (txt && txt.length < 200) { el = child; break; }
        }
        if (!el) {
          const txt = a.textContent.trim();
          if (txt && txt.length < 200) el = a;
        }
      }
    }
    if (!el) {
      const attr = card.getAttribute("aria-label") || card.getAttribute("data-name") || card.getAttribute("title");
      if (attr && attr.trim()) return attr.trim();
    }
    if (!el) return null;
    return el.textContent.trim();
  }

  function findPriceAnchor(card, isSpotlight) {
    if (card.matches(".game_area_dlc_row")) {
      return card.querySelector(".game_area_dlc_price") || null;
    }

    if (card.closest(".bundle_package_item")) {
      return (
        card.querySelector(".discount_block") ||
        card.querySelector(".discount_prices") ||
        null
      );
    }
    if (isSpotlight) {
      return (
        card.querySelector(".discount_prices") ||
        card.querySelector(".discount_final_price") ||
        card.querySelector("[data-price-final]") ||
        card.querySelector("[class*='price']") ||
        null
      );
    }
    return (
      card.querySelector(".discount_prices") ||
      card.querySelector(".game_purchase_price") ||
      card.querySelector("[data-price-final]") ||
      card.querySelector("[class*='price']") ||
      null
    );
  }

  const _badgeMeta = new WeakMap();

  function createBadge(spphResult, priceInfo) {
    const badge = document.createElement("div");
    badge.className = "spph-ratio-badge";
    badge.setAttribute("role", "status");
    badge.setAttribute("tabindex", "0");

    const labels = getLabels();
    const mode = _settings.valueMode;

    const modeKey = mode === "plus" ? "plus" : mode === "completionist" ? "completionist" : "main";
    const modeLabel =
      mode === "plus" ? labels.plus : mode === "completionist" ? labels.completionist : labels.story;
    const selectedHours = spphResult ? (spphResult[modeKey] || 0) : 0;

    if (spphResult && selectedHours > 0) {
      const timeSpan = document.createElement("span");
      timeSpan.className = "spph-ratio-badge__time";
      const labelSpan = document.createElement("span");
      labelSpan.className = "spph-ratio-badge__time-label";
      labelSpan.textContent = modeLabel + ":";
      timeSpan.appendChild(labelSpan);
      timeSpan.appendChild(document.createTextNode(" " + fmtH(selectedHours) + labels.hr));
      badge.appendChild(timeSpan);
    } else {
      const timeSpan = document.createElement("span");
      timeSpan.className = "spph-ratio-badge__time";
      const labelSpan = document.createElement("span");
      labelSpan.className = "spph-ratio-badge__time-label";
      labelSpan.textContent = modeLabel + ":";
      timeSpan.appendChild(labelSpan);
      timeSpan.appendChild(document.createTextNode(" N/A"));
      badge.appendChild(timeSpan);
      badge.classList.add("spph-ratio-badge--na");
    }

    const ratioFmt = new Intl.NumberFormat(navigator.language || "en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (priceInfo && priceInfo.isFree) {
      const ratioSpan = document.createElement("span");
      ratioSpan.className = "spph-ratio-badge__ratio";
      ratioSpan.textContent = "0/" + labels.hr + " \u00B7 " + labels.free;
      badge.appendChild(ratioSpan);
      badge.classList.add("spph-ratio-badge--dynamic");
      badge.style.setProperty("--spph-hue", "120");
      badge.style.setProperty("--spph-saturation", "65%");
      badge.style.setProperty("--spph-lightness", "45%");
      badge.style.setProperty("--spph-intensity", "0.3");
    } else if (
      priceInfo &&
      selectedHours > 0 &&
      priceInfo.amount > 0
    ) {
      const ratioSpan = document.createElement("span");
      ratioSpan.className = "spph-ratio-badge__ratio";
      const ratio = +(priceInfo.amount / selectedHours).toFixed(2);
      const curr = priceInfo.formattedCurrency;
      ratioSpan.textContent = curr + ratioFmt.format(ratio) + "/" + labels.hr;
      badge.appendChild(ratioSpan);

      if (priceInfo.currencyCode) {
        const acceptable = _settings.acceptablePrice;
        const lower = acceptable * 0.8;
        const upper = acceptable * 1.2;
        const redMax = acceptable * 3;
        let hue, saturation, lightness, intensity;

        if (ratio <= lower) {
          const t = lower > 0 ? ratio / lower : 0;
          hue = 140 - 20 * t;
          saturation = 65 + 10 * t;
          lightness = 45 + 3 * t;
          intensity = 0.12 + 0.23 * t;
        } else if (ratio <= upper) {
          const span = Math.max(upper - lower, 0.01);
          const t = (ratio - lower) / span;
          hue = 120 - 60 * t;
          saturation = 75 + 5 * t;
          lightness = 48 + 4 * t;
          intensity = 0.35 + 0.25 * t;
        } else {
          const span = Math.max(redMax - upper, 0.01);
          const t = Math.min(1, (ratio - upper) / span);
          hue = 60 - 60 * t;
          saturation = 80 - 10 * t;
          lightness = 52 - 10 * t;
          intensity = 0.6 + 0.4 * t;
        }

        badge.classList.add("spph-ratio-badge--dynamic");
        badge.style.setProperty("--spph-hue", String(hue));
        badge.style.setProperty("--spph-saturation", String(+saturation.toFixed(1)) + "%");
        badge.style.setProperty("--spph-lightness", String(+lightness.toFixed(1)) + "%");
        badge.style.setProperty("--spph-intensity", String(+intensity.toFixed(3)));
      } else {
        badge.classList.add("spph-ratio-badge--neutral");
      }
    }

    const tipLines = [];
    if (spphResult) {
      tipLines.push(modeLabel + ": " + fmtH(selectedHours) + labels.hr);
      if (spphResult.main > 0) tipLines.push(labels.story + ": " + fmtH(spphResult.main) + labels.hr);
      if (spphResult.plus > 0) tipLines.push(labels.plus + ": " + fmtH(spphResult.plus) + labels.hr);
      if (spphResult.completionist > 0) tipLines.push(labels.completionist + ": " + fmtH(spphResult.completionist) + labels.hr);
    }
    if (priceInfo && !priceInfo.isFree && priceInfo.amount > 0) {
      const curr = priceInfo.formattedCurrency;
      tipLines.push("Price: " + curr + priceInfo.amount);
      if (priceInfo.currencyCode) {
        const modeInfo = _settings.valueMode === "completionist" ? "100%"
          : _settings.valueMode === "plus" ? "Main+Extra"
          : "Story";
        tipLines.push("\u0414\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E: " + curr + _settings.acceptablePrice + "/\u0447 \u00B120%"
          + " (" + modeInfo + ")");
      }
    }
    if (tipLines.length)
      badge.setAttribute("title", tipLines.join(" \u00B7 "));

    return badge;
  }

  function createPlaceholderBadge() {
    const badge = document.createElement("div");
    badge.className = "spph-ratio-badge spph-ratio-badge--loading";
    badge.setAttribute("role", "status");
    const span = document.createElement("span");
    span.className = "spph-ratio-badge__time";
    span.textContent = "Playtime: \u2026";
    badge.appendChild(span);
    return badge;
  }

  function insertBadgeInPurchaseArea(wrapper, badge) {
    const action = wrapper.querySelector(".game_purchase_action");
    if (action) {
      const allActionBgs = action.querySelectorAll(".game_purchase_action_bg");
      let priceActionBg = null;
      for (const bg of allActionBgs) {
        if (
          bg.querySelector(".discount_block, .game_purchase_price, .your_price, [data-price-final]")
        ) {
          priceActionBg = bg;
          break;
        }
      }
      const actionBg = priceActionBg || allActionBgs[0] || null;
      if (actionBg) {
        action.insertBefore(badge, actionBg);
        return;
      }
    }
    const anchor = findPriceAnchor(wrapper, false);
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(badge, anchor.nextSibling);
    } else {
      wrapper.appendChild(badge);
    }
  }

  async function processAppPageWrapper(wrapper) {
    const existingBadge = wrapper.querySelector(".spph-ratio-badge");

    const title = extractAppPageTitle();
    if (!title) return;

    const appId = extractAppPageAppId(wrapper);
    const priceInfo = extractPrice(wrapper);
    if (!priceInfo || priceInfo.isFree) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    let spphData = null;
    try {
      const cacheResult = await getCachedHours(title);
      if (cacheResult.cached) {
        spphData = cacheResult.data;
      } else if (_settings.enabled) {
        spphData = await enqueue(title, appId);
      }
    } catch {}

    if (!_settings.enabled && !spphData) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    const badge = createBadge(spphData, priceInfo);
    badge.classList.add("spph-ratio-badge--app-page");
    _badgeMeta.set(badge, { spphData, priceInfo, title, contextClass: "spph-ratio-badge--app-page" });

    if (existingBadge) {
      existingBadge.replaceWith(badge);
    } else {
      insertBadgeInPurchaseArea(wrapper, badge);
    }
  }

  async function processBundleWrapper(wrapper) {
    const existingBadge = wrapper.querySelector(".spph-ratio-badge");

    let bundleDataStr = wrapper.getAttribute("data-ds-bundle-data");

    if (!bundleDataStr && isBundlePage()) {
      const bundleId = wrapper.getAttribute("data-ds-bundleid");
      if (!bundleId) return;
      const bearing = document.querySelector(
        '[data-ds-bundle-data][data-ds-bundleid="' + bundleId + '"]'
      ) || document.querySelector('[data-ds-bundle-data]');
      if (!bearing) return;
      bundleDataStr = bearing.getAttribute("data-ds-bundle-data");
      if (!bundleDataStr) return;
    }
    if (!bundleDataStr) return;

    let bundleData;
    try {
      bundleData = JSON.parse(bundleDataStr);
    } catch {
      return;
    }
    if (!bundleData || !Array.isArray(bundleData.m_rgItems)) return;

    const appIds = new Set();
    for (const item of bundleData.m_rgItems) {
      if (Array.isArray(item.m_rgIncludedAppIDs)) {
        for (const id of item.m_rgIncludedAppIDs) {
          const n = numericId(id);
          if (n) appIds.add(n);
        }
      }
    }
    if (appIds.size === 0) return;

    const titleMap = new Map();
    const previewAnchors = wrapper.querySelectorAll("a[data-ds-appid]");
    for (const a of previewAnchors) {
      const id = numericId(a.getAttribute("data-ds-appid"));
      if (!id || !appIds.has(id)) continue;
      const img = a.querySelector("img[alt]");
      if (img) {
        const alt = img.getAttribute("alt");
        if (alt && alt.trim()) titleMap.set(id, alt.trim());
      }
    }

    const appLinks = wrapper.querySelectorAll('a[href*="/app/"]');
    for (const a of appLinks) {
      const m = a.href.match(/\/app\/(\d+)/);
      if (!m) continue;
      const id = numericId(m[1]);
      if (!id || !appIds.has(id)) continue;
      if (titleMap.has(id)) continue;
      const txt = a.textContent.trim();
      if (txt) titleMap.set(id, txt);
    }

    if (isBundlePage()) {
      for (const appId of appIds) {
        if (titleMap.has(appId)) continue;
        const tabItems = document.querySelectorAll(
          '.tab_item[data-ds-appid="' + appId + '"]'
        );
        for (const tabItem of tabItems) {
          const nameEl = tabItem.querySelector('.tab_item_name');
          if (nameEl) {
            const txt = nameEl.textContent.trim();
            if (txt) { titleMap.set(appId, txt); break; }
          }
          const appLink = tabItem.querySelector('a[href*="/app/' + appId + '"]');
          if (appLink) {
            const txt = appLink.textContent.trim();
            if (txt) { titleMap.set(appId, txt); break; }
          }
          const imgEl = tabItem.querySelector('img[alt]');
          if (imgEl) {
            const alt = imgEl.getAttribute('alt');
            if (alt && alt.trim()) { titleMap.set(appId, alt.trim()); break; }
          }
        }
      }
    }

    const priceInfo = extractBundlePrice(wrapper);
    if (!priceInfo) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    let totalMain = 0, totalPlus = 0, totalComp = 0;
    let hasAnyHours = false;

    for (const appId of appIds) {
      const title = titleMap.get(appId);
      if (!title) continue;

      let data = null;
      try {
        const cacheResult = await getCachedHours(title);
        if (cacheResult.cached) {
          data = cacheResult.data;
        } else if (_settings.enabled) {
          data = await enqueue(title, String(appId));
        }
      } catch {}

      if (data) {
        if (data.main > 0) { totalMain += data.main; hasAnyHours = true; }
        if (data.plus > 0) { totalPlus += data.plus; hasAnyHours = true; }
        if (data.completionist > 0) { totalComp += data.completionist; hasAnyHours = true; }
      }
    }

    if (!hasAnyHours) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    const aggregatedSpph = {
      main: totalMain,
      plus: totalPlus,
      completionist: totalComp,
    };

    const badge = createBadge(aggregatedSpph, priceInfo);
    badge.classList.add("spph-ratio-badge--bundle");
    _badgeMeta.set(badge, { spphData: aggregatedSpph, priceInfo, title: "Bundle", contextClass: "spph-ratio-badge--bundle" });

    if (existingBadge) {
      existingBadge.replaceWith(badge);
    } else {
      insertBadgeInPurchaseArea(wrapper, badge);
    }
  }

  async function getCachedHours(name) {
    const keys = [nfKey(name), nfKeyLegacy(name), cacheKey(name), cacheKeyLegacy(name)];
    try {
      const data = await chrome.storage.local.get(keys);
      const now = Date.now();

      const nfCur = data[nfKey(name)];
      if (nfCur && nfCur.timestamp && (now - nfCur.timestamp) < TTL_NOTFOUND) {
        return { cached: true, data: null };
      }
      const nfLeg = data[nfKeyLegacy(name)];
      if (nfLeg && nfLeg.timestamp && (now - nfLeg.timestamp) < TTL_NOTFOUND) {
        return { cached: true, data: null };
      }

      const cur = data[cacheKey(name)];
      if (cur && cur.timestamp && (now - cur.timestamp) <= TTL_FOUND && (cur.main !== null || cur.plus !== null)) {
        return { cached: true, data: cur };
      }
      const leg = data[cacheKeyLegacy(name)];
      if (leg && leg.timestamp && (now - leg.timestamp) <= TTL_FOUND && (leg.main !== null || leg.plus !== null)) {
        return { cached: true, data: leg };
      }
    } catch {
    }
    return { cached: false, data: null };
  }

  async function processCard(card) {
    const title = extractTitle(card);
    if (!title) return;
    const priceInfo = extractPrice(card);

    if (!priceInfo || priceInfo.isFree === true) {
      const existingBadge = card.querySelector(".spph-ratio-badge");
      if (existingBadge) existingBadge.remove();
      return;
    }

    const steamAppId = extractSteamAppId(card);

    let spphData = null;
    try {
      const cacheResult = await getCachedHours(title);
      if (cacheResult.cached) {
        spphData = cacheResult.data;
      } else if (_settings.enabled) {
        spphData = await enqueue(title, steamAppId);
      }
    } catch {
    }

    if (!_settings.enabled) {
      if (!spphData) {
        const existingBadge = card.querySelector(".spph-ratio-badge");
        if (existingBadge) existingBadge.remove();
        return;
      }
    }

    const existingBadge = card.querySelector(".spph-ratio-badge");
    const fullBadge = createBadge(spphData, priceInfo);
    const isSpotlight = card.matches(".home_area_spotlight");
    _badgeMeta.set(fullBadge, { spphData, priceInfo, title });

    if (existingBadge) {
      existingBadge.replaceWith(fullBadge);
    } else {
      const anchor = findPriceAnchor(card, isSpotlight);
      if (anchor && anchor.parentNode) {
        if (card.closest(".bundle_package_item")) {
          anchor.parentNode.insertBefore(fullBadge, anchor);
        } else if (card.matches('.game_area_dlc_row')) {
          anchor.appendChild(fullBadge);
        } else {
          anchor.parentNode.insertBefore(fullBadge, anchor.nextSibling);
        }
      } else {
        card.appendChild(fullBadge);
      }
    }
  }

  function findCards(root) {
    const set = new Set();
    for (const sel of [
      SELECTORS.searchRow,
      SELECTORS.saleCapsule,
      SELECTORS.dlcRow,
    ]) {
      root.querySelectorAll(sel).forEach((el) => set.add(el));
    }
    root.querySelectorAll(SELECTORS.spotlight).forEach((el) => {
      if (el.getAttribute("data-ds-appid")) set.add(el);
    });
    root.querySelectorAll(SELECTORS.discountFallback).forEach((el) => {
      const parent = el.closest("a, div[class*='capsule'], div[class*='sale']");
      if (!parent) return;
      if (parent.closest('[data-rfd-draggable-id^="WishlistItem-"]')) return;
      if (parent.closest('.wishlist_row')) return;
      set.add(parent);
    });

    if (isAppPage()) {
      root.querySelectorAll(SELECTORS.appPurchaseWrapper).forEach((el) => {
        set.add(el);
      });
    }

    if (isBundlePage()) {
      root.querySelectorAll(
        '.game_area_purchase_game.bundle[data-ds-bundleid], [data-ds-bundle-data]'
      ).forEach((el) => set.add(el));

      root.querySelectorAll('.bundle_package_item .tab_item[data-ds-appid]').forEach((el) => set.add(el));
    }

    const arr = [...set];
    return arr.filter((el) => !arr.some((other) => el !== other && other.contains(el)));
  }

  let _processing = false;
  let _needsRescan = false;
  let _seenCards = new WeakSet();

  function getCardType(card, isCurrentAppPage) {
    if (card.hasAttribute("data-ds-bundle-data")) return "bundle";
    if (isBundlePage() && card.matches('.game_area_purchase_game.bundle[data-ds-bundleid]')) return "bundle";
    if (isCurrentAppPage && card.matches(SELECTORS.appPurchaseWrapper)) return "app-page";
    return "default";
  }

  async function processAllVisible(root = document) {
    if (_processing) {
      _needsRescan = true;
      return;
    }
    _processing = true;
    try {
      const isCurrentAppPage = isAppPage();

      const cards = [];
      for (const card of findCards(root)) {
        if (_seenCards.has(card)) continue;
        _seenCards.add(card);
        cards.push(card);
      }

      for (const card of cards) {
        if (!card.querySelector(".spph-ratio-badge")) {
          if (!_settings.enabled) continue;

          const cardType = getCardType(card, isCurrentAppPage);

          if (cardType === "bundle" || cardType === "app-page") {
            const priceInfo = cardType === "bundle" ? extractBundlePrice(card) : extractPrice(card);
            if (!priceInfo || priceInfo.isFree) continue;

            const placeholder = createPlaceholderBadge();
            placeholder.classList.add(cardType === "bundle" ? "spph-ratio-badge--bundle" : "spph-ratio-badge--app-page");
            insertBadgeInPurchaseArea(card, placeholder);
          } else {
            const title = extractTitle(card);
            if (title) {
              const priceInfo = extractPrice(card);
              if (!priceInfo || priceInfo.isFree === true) continue;
              const placeholder = createPlaceholderBadge();
              const isSpotlight = card.matches(".home_area_spotlight");
              const anchor = findPriceAnchor(card, isSpotlight);
              if (anchor && anchor.parentNode) {
                if (card.closest(".bundle_package_item")) {
                  anchor.parentNode.insertBefore(placeholder, anchor);
                } else if (card.matches('.game_area_dlc_row')) {
                  anchor.appendChild(placeholder);
                } else {
                  anchor.parentNode.insertBefore(placeholder, anchor.nextSibling);
                }
              } else {
                card.appendChild(placeholder);
              }
            }
          }
        }
      }

      await Promise.allSettled(cards.map((c) => {
        const cardType = getCardType(c, isCurrentAppPage);
        if (cardType === "bundle") return processBundleWrapper(c);
        if (cardType === "app-page") return processAppPageWrapper(c);
        return processCard(c);
      }));
    } finally {
      _processing = false;
      if (_needsRescan) {
        _needsRescan = false;
        processAllVisible();
      }
    }
  }

  function rerenderBadges() {
    document.querySelectorAll(".spph-ratio-badge").forEach((old) => {
      const meta = _badgeMeta.get(old);
      if (!meta) return;
      const newBadge = createBadge(meta.spphData, meta.priceInfo);
      if (meta.contextClass) {
        newBadge.classList.add(meta.contextClass);
      }
      _badgeMeta.set(newBadge, meta);
      old.replaceWith(newBadge);
    });
  }

  let _observerTimer = null;

  function scheduleScan() {
    if (_observerTimer) clearTimeout(_observerTimer);
    _observerTimer = setTimeout(() => processAllVisible(), OBSERVER_DEBOUNCE_MS);
  }

  function startObserver() {
    const obs = new MutationObserver((mutations) => {
      let spotlightAttrChanged = false;
      let appPageChanged = false;
      let bundlePageChanged = false;

      for (const m of mutations) {
        if (m.target && m.target.nodeType === Node.ELEMENT_NODE) {
          if (m.target.classList && m.target.classList.contains("spph-ratio-badge")) continue;
          if (m.target.closest && m.target.closest(".spph-ratio-badge")) continue;
        }
        if (m.type === "characterData") {
          const parentEl = m.target.parentElement;
          if (parentEl) {
            if (parentEl.classList && parentEl.classList.contains("spph-ratio-badge")) continue;
            if (parentEl.closest && parentEl.closest(".spph-ratio-badge")) continue;
            if (parentEl.closest && parentEl.closest(".home_area_spotlight")) {
              _seenCards = new WeakSet();
              scheduleScan();
              return;
            }
            if (parentEl.closest && parentEl.closest(SELECTORS.appPurchaseWrapper)) {
              appPageChanged = true;
            }
            if (isBundlePage() && parentEl.closest) {
              if (parentEl.closest('[data-ds-bundle-data]') ||
                  parentEl.closest('.tab_item[data-ds-appid]') ||
                  parentEl.closest('.bundle_package_item')) {
                _seenCards = new WeakSet();
                scheduleScan();
                return;
              }
            }
          }
          continue;
        }
        if (
          m.type === "attributes" &&
          (m.attributeName === "data-price-final" || m.attributeName === "data-ds-appid" || m.attributeName === "alt" || m.attributeName === "data-ds-bundle-data")
        ) {
          const spotlight = m.target.closest ? m.target.closest(".home_area_spotlight") : null;
          if (spotlight) spotlightAttrChanged = true;

          const appWrapper = m.target.closest ? m.target.closest(SELECTORS.appPurchaseWrapper) : null;
          if (appWrapper) appPageChanged = true;

          if (isBundlePage() && m.target.closest) {
            if (m.target.closest('[data-ds-bundle-data]') ||
                m.target.closest('.tab_item[data-ds-appid]') ||
                m.target.closest('.bundle_package_item')) {
              bundlePageChanged = true;
            }
          }

          continue;
        }
        if (m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList && node.classList.contains("spph-ratio-badge")) continue;
              if (node.querySelector && node.querySelector(".spph-ratio-badge")) continue;
              if (m.target && m.target.closest && m.target.closest(".home_area_spotlight")) {
                _seenCards = new WeakSet();
              }
              if (m.target && m.target.closest && m.target.closest(SELECTORS.appPurchaseWrapper)) {
                appPageChanged = true;
              }
              if (isBundlePage() && m.target && m.target.closest) {
                if (m.target.closest('[data-ds-bundle-data]') ||
                    m.target.closest('.bundle_package_item') ||
                    m.target.closest('.tab_item[data-ds-appid]')) {
                  _seenCards = new WeakSet();
                }
              }
              scheduleScan();
              return;
            }
          }
        }
      }
      if (spotlightAttrChanged || appPageChanged || bundlePageChanged) {
        _seenCards = new WeakSet();
        scheduleScan();
      }
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-price-final", "data-ds-appid", "alt", "data-ds-bundle-data"],
    });
  }

  let _lastURL = location.href;

  function checkRouteChange() {
    if (location.href !== _lastURL) {
      _lastURL = location.href;
      _seenCards = new WeakSet();
      scheduleScan();
    }
  }
  window.addEventListener("popstate", scheduleScan);
  setInterval(checkRouteChange, 2000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SETTINGS_KEY] || changes[SETTINGS_KEY_LEGACY]) {
      const changeData = changes[SETTINGS_KEY] || changes[SETTINGS_KEY_LEGACY];
      const raw = changeData.newValue;
      if (raw && typeof raw === "object") {
        _settings = parseSettings(raw);
      }
      if (!_settings.enabled) {
        _seenCards = new WeakSet();
        processAllVisible();
      } else {
        const old = changeData.oldValue;
        if (old && old.enabled === false) {
          _seenCards = new WeakSet();
          processAllVisible();
        } else {
          rerenderBadges();
        }
      }
    }
  });

  async function boot() {
    await loadSettings();
    setTimeout(() => processAllVisible(), INITIAL_DELAY_MS);
    startObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
