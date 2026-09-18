import {
  settingsManager,
  cacheManager,
  eventBus,
  EVENT_NAMES,
  secondsToHours,
  isAppPage,
  isBundlePage,
  extractPrice,
  extractBundlePrice,
  extractSteamAppId,
  extractTitle,
  findPriceAnchor,
  extractAppPageAppId,
  extractAppPageTitle,
  SELECTORS,
  createBadge,
  createPlaceholderBadge,
  createErrorBadge,
  insertBadgeInPurchaseArea,
  setBadgeMeta,
  getBadgeMeta,
  domObserver,
  OBSERVER_DEBOUNCE_MS,
  fetchPlaytimeBatch,
  numericId,
} from "./modules/index.js";

(() => {
  "use strict";

  const INITIAL_DELAY_MS = 500;

  const RATE_LIMIT_RETRY_MAX = 3;
  const RATE_LIMIT_RETRY_DELAY_MS = 1500;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const _queue = [];
  const _inflight = new Map();
  let _busy = false;

  function enqueue(steamAppId) {
    const key = String(steamAppId);
    if (_inflight.has(key)) {
      return _inflight.get(key);
    }
    const promise = new Promise((resolve, reject) => {
      _queue.push({ steamAppId, resolve, reject });
      drainQueue();
    });
    _inflight.set(key, promise);
    promise.finally(() => {
      _inflight.delete(key);
    });
    return promise;
  }

  async function drainQueue() {
    if (_busy || _queue.length === 0) return;
    _busy = true;
    while (_queue.length > 0) {
      const job = _queue.shift();
      try {
        job.resolve(await fetchSPPH(job.steamAppId));
      } catch (err) {
        job.reject(err);
      }
    }
    _busy = false;
  }

  async function fetchSPPH(steamAppId) {
    if (!steamAppId) {
      return null;
    }

    if (await cacheManager.getNotFoundByAppId(steamAppId)) {
      return null;
    }
    const cached = await cacheManager.getCacheByAppId(steamAppId);
    if (cached) {
      return cached;
    }

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "spphBySteamApp",
        steamAppId,
      });
    } catch (err) {
      console.error("[SPPH Content] Error sending message to service_worker:", err);
      response = null;
    }

    if (response && response.errorCode === "steam_not_open") {
      return null;
    }

    if (response && response.errorCode === "rate_limited") {
      for (let attempt = 1; attempt <= RATE_LIMIT_RETRY_MAX; attempt++) {
        await sleep(RATE_LIMIT_RETRY_DELAY_MS);
        try {
          response = await chrome.runtime.sendMessage({
            type: "spphBySteamApp",
            steamAppId,
          });
        } catch (err) {
          console.error("[SPPH Content] Error sending message to service_worker:", err);
          response = null;
          break;
        }
        if (!response || response.errorCode !== "rate_limited") break;
      }
      if (response && response.errorCode === "rate_limited") {
        console.warn("[SPPH Content] API error: rate_limited (retries exhausted)");
        return { error: "rate_limited" };
      }
    }

    if (
      response &&
      (response.errorCode === "auth_missing" || response.errorCode === "auth_invalid")
    ) {
      console.warn("[SPPH Content] API error:", response.errorCode);
      return { error: response.errorCode };
    }

    if (!response || !response.ok) {
      const errorCode = (response && response.errorCode) || "network_error";
      if (errorCode === "not_found") {
        await cacheManager.markNotFoundByAppId(steamAppId);
      }
      return { error: errorCode };
    }

    const data = response.data;
    if (!data || typeof data !== "object") {
      return null;
    }

    const mainH = secondsToHours(data.comp_main);
    const plusH = secondsToHours(data.comp_plus);
    const compH = secondsToHours(data.comp_100);

    if (mainH === 0 && plusH === 0) {
      return null;
    }

    const result = { main: mainH, plus: plusH, completionist: compH };
    await cacheManager.setCacheByAppId(steamAppId, mainH, plusH, compH);
    return result;
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
      const cacheResult = await cacheManager.getCachedHours(appId, title);
      if (cacheResult.cached) {
        spphData = cacheResult.data || { error: "not_found" };
      } else {
        spphData = await enqueue(appId);
      }
    } catch {}

    const hasError = spphData && spphData.error;
    const badge = hasError ? createErrorBadge(spphData.error) : createBadge(spphData, priceInfo);
    badge.classList.add("spph-ratio-badge--app-page");
    if (!hasError) {
      setBadgeMeta(badge, {
        spphData,
        priceInfo,
        title,
        contextClass: "spph-ratio-badge--app-page",
      });
    }

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
      const bearing =
        document.querySelector('[data-ds-bundle-data][data-ds-bundleid="' + bundleId + '"]') ||
        document.querySelector("[data-ds-bundle-data]");
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
        const tabItems = document.querySelectorAll('.tab_item[data-ds-appid="' + appId + '"]');
        for (const tabItem of tabItems) {
          const nameEl = tabItem.querySelector(".tab_item_name");
          if (nameEl) {
            const txt = nameEl.textContent.trim();
            if (txt) {
              titleMap.set(appId, txt);
              break;
            }
          }
          const appLink = tabItem.querySelector('a[href*="/app/' + appId + '"]');
          if (appLink) {
            const txt = appLink.textContent.trim();
            if (txt) {
              titleMap.set(appId, txt);
              break;
            }
          }
          const imgEl = tabItem.querySelector("img[alt]");
          if (imgEl) {
            const alt = imgEl.getAttribute("alt");
            if (alt && alt.trim()) {
              titleMap.set(appId, alt.trim());
              break;
            }
          }
        }
      }
    }

    const priceInfo = extractBundlePrice(wrapper);
    if (!priceInfo) {
      if (existingBadge) existingBadge.remove();
      return;
    }

    const results = new Map();
    const uncachedIds = [];

    for (const appId of appIds) {
      const title = titleMap.get(appId);
      if (!title) continue;
      try {
        const cacheResult = await cacheManager.getCachedHours(String(appId), title);
        if (cacheResult.cached) {
          results.set(appId, cacheResult.data);
        } else {
          uncachedIds.push(String(appId));
        }
      } catch {}
    }

    if (uncachedIds.length > 0) {
      try {
        let batchResponse = null;
        for (let attempt = 1; attempt <= RATE_LIMIT_RETRY_MAX; attempt++) {
          batchResponse = await fetchPlaytimeBatch(uncachedIds);
          if (
            !batchResponse ||
            batchResponse.ok ||
            batchResponse.errorCode !== "rate_limited" ||
            attempt === RATE_LIMIT_RETRY_MAX
          ) {
            break;
          }
          await sleep(RATE_LIMIT_RETRY_DELAY_MS);
        }
        if (
          batchResponse &&
          !batchResponse.ok &&
          (batchResponse.errorCode === "auth_missing" ||
            batchResponse.errorCode === "auth_invalid" ||
            batchResponse.errorCode === "rate_limited")
        ) {
          console.warn("[SPPH Content] Batch API error:", batchResponse.errorCode);
        } else if (batchResponse && batchResponse.ok && Array.isArray(batchResponse.data)) {
          const gamesByAppId = new Map();
          for (const game of batchResponse.data) {
            if (!game || typeof game !== "object") continue;
            const id = game.appId ?? game.appid ?? game.id;
            if (id != null) gamesByAppId.set(String(id), game);
          }
          for (const appId of uncachedIds) {
            const game = gamesByAppId.get(String(appId));
            if (!game || typeof game !== "object") continue;
            const mainH = secondsToHours(game.comp_main);
            const plusH = secondsToHours(game.comp_plus);
            const compH = secondsToHours(game.comp_100);
            if (mainH === 0 && plusH === 0) {
              continue;
            }
            const data = { main: mainH, plus: plusH, completionist: compH };
            cacheManager.setCacheByAppId(appId, mainH, plusH, compH);
            results.set(appId, data);
          }
        }
      } catch {}
    }

    let totalMain = 0,
      totalPlus = 0,
      totalComp = 0;
    let hasAnyHours = false;

    for (const appId of appIds) {
      const data = results.get(appId);
      if (data) {
        if (data.main > 0) {
          totalMain += data.main;
          hasAnyHours = true;
        }
        if (data.plus > 0) {
          totalPlus += data.plus;
          hasAnyHours = true;
        }
        if (data.completionist > 0) {
          totalComp += data.completionist;
          hasAnyHours = true;
        }
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
    setBadgeMeta(badge, {
      spphData: aggregatedSpph,
      priceInfo,
      title: "Bundle",
      contextClass: "spph-ratio-badge--bundle",
    });

    if (existingBadge) {
      existingBadge.replaceWith(badge);
    } else {
      insertBadgeInPurchaseArea(wrapper, badge);
    }
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
      const cacheResult = await cacheManager.getCachedHours(steamAppId, title);
      if (cacheResult.cached) {
        spphData = cacheResult.data || { error: "not_found" };
      } else {
        spphData = await enqueue(steamAppId);
      }
    } catch {}

    const existingBadge = card.querySelector(".spph-ratio-badge");
    const hasError = spphData && spphData.error;
    const fullBadge = hasError
      ? createErrorBadge(spphData.error)
      : createBadge(spphData, priceInfo);
    const isSpotlight = card.matches(".home_area_spotlight");
    if (!hasError) {
      setBadgeMeta(fullBadge, { spphData, priceInfo, title });
    }

    if (existingBadge) {
      existingBadge.replaceWith(fullBadge);
    } else {
      const anchor = findPriceAnchor(card, isSpotlight);
      if (anchor && anchor.parentNode) {
        if (card.closest(".bundle_package_item")) {
          anchor.parentNode.insertBefore(fullBadge, anchor);
        } else if (card.matches(".game_area_dlc_row")) {
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
    for (const sel of [SELECTORS.searchRow, SELECTORS.saleCapsule, SELECTORS.dlcRow]) {
      root.querySelectorAll(sel).forEach((el) => set.add(el));
    }
    root.querySelectorAll(SELECTORS.spotlight).forEach((el) => {
      if (el.getAttribute("data-ds-appid")) set.add(el);
    });
    root.querySelectorAll(SELECTORS.discountFallback).forEach((el) => {
      const parent = el.closest("a, div[class*='capsule'], div[class*='sale']");
      if (!parent) return;
      if (parent.closest('[data-rfd-draggable-id^="WishlistItem-"]')) return;
      if (parent.closest(".wishlist_row")) return;
      set.add(parent);
    });

    if (isAppPage()) {
      root.querySelectorAll(SELECTORS.appPurchaseWrapper).forEach((el) => {
        set.add(el);
      });
    }

    if (isBundlePage()) {
      root
        .querySelectorAll(
          ".game_area_purchase_game.bundle[data-ds-bundleid], [data-ds-bundle-data]",
        )
        .forEach((el) => set.add(el));

      root
        .querySelectorAll(".bundle_package_item .tab_item[data-ds-appid]")
        .forEach((el) => set.add(el));
    }

    const arr = [...set];
    return arr.filter((el) => !arr.some((other) => el !== other && other.contains(el)));
  }

  let _processing = false;
  let _needsRescan = false;

  function getCardType(card, isCurrentAppPage) {
    if (card.hasAttribute("data-ds-bundle-data")) return "bundle";
    if (isBundlePage() && card.matches(".game_area_purchase_game.bundle[data-ds-bundleid]")) {
      return "bundle";
    }
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
      const cards = findCards(root);

      for (const card of cards) {
        if (!card.querySelector(".spph-ratio-badge")) {
          const cardType = getCardType(card, isCurrentAppPage);

          if (cardType === "bundle" || cardType === "app-page") {
            const priceInfo = cardType === "bundle" ? extractBundlePrice(card) : extractPrice(card);
            if (!priceInfo || priceInfo.isFree) continue;

            const placeholder = createPlaceholderBadge();
            placeholder.classList.add(
              cardType === "bundle" ? "spph-ratio-badge--bundle" : "spph-ratio-badge--app-page",
            );
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
                } else if (card.matches(".game_area_dlc_row")) {
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

      await Promise.allSettled(
        cards.map((c) => {
          const cardType = getCardType(c, isCurrentAppPage);
          if (cardType === "bundle") return processBundleWrapper(c);
          if (cardType === "app-page") return processAppPageWrapper(c);
          return processCard(c);
        }),
      );

      eventBus.emit(EVENT_NAMES.CARD_PROCESSED, { count: cards.length });
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
      const meta = getBadgeMeta(old);
      if (!meta) return;
      const newBadge = createBadge(meta.spphData, meta.priceInfo);
      if (meta.contextClass) {
        newBadge.classList.add(meta.contextClass);
      }
      setBadgeMeta(newBadge, meta);
      old.replaceWith(newBadge);
    });
  }

  let _observerTimer = null;

  function scheduleScan() {
    if (_observerTimer) clearTimeout(_observerTimer);
    _observerTimer = setTimeout(() => processAllVisible(), OBSERVER_DEBOUNCE_MS);
  }

  function startObserver() {
    domObserver.start(processAllVisible);
    window.addEventListener("popstate", scheduleScan);
    setInterval(checkRouteChange, 2000);
  }

  let _lastURL = location.href;

  function checkRouteChange() {
    if (location.href !== _lastURL) {
      _lastURL = location.href;
      scheduleScan();
    }
  }

  settingsManager.listenForChanges(() => {
    rerenderBadges();
  });

  async function boot() {
    await settingsManager.load();
    setTimeout(() => processAllVisible(), INITIAL_DELAY_MS);
    startObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
