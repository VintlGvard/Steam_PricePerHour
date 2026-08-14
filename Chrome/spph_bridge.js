(() => {
  "use strict";

  const HLTB_INIT = location.origin + "/api/bleed/init";
  const HLTB_API  = location.origin + "/api/bleed";
  const REQUEST_TIMEOUT_MS = 15000;
  const AUTH_TTL_MS = 5 * 60 * 1000;

  let _authCache = null;
  let _authCacheTime = 0;

  function normalizeForSearch(raw) {
    if (!raw) return "";
    return raw
      .replace(/[\u2122\u00AE\u00A9]/g, "")
      .replace(/[:;!\?\.\-,\/\\'"„""–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  async function fetchInit() {
    if (_authCache && (Date.now() - _authCacheTime) < AUTH_TTL_MS) {
      return _authCache;
    }
    const t = Date.now();
    try {
      const resp = await fetch(HLTB_INIT + "?t=" + t, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!resp.ok) {
        const code = resp.status === 403 ? "init_403" : "init_" + resp.status;
        throw { errorCode: code };
      }
      const json = await resp.json();
      const hasToken = typeof json?.token === "string";
      const hasHpKey = typeof json?.hpKey === "string";
      const hasHpVal = typeof json?.hpVal === "string";
      if (!hasToken || !hasHpKey || !hasHpVal) {
        throw { errorCode: "parse_error" };
      }
      _authCache = json;
      _authCacheTime = Date.now();
      return json;
    } catch (e) {
      if (e.errorCode) throw e;
      throw { errorCode: "transport_error" };
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

  async function handleBridgeRequest(gameName) {
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
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const errorCode = resp.status === 403 ? "search_403" : "search_" + resp.status;
        if (resp.status === 403) { _authCache = null; _authCacheTime = 0; }
        return { ok: false, errorCode };
      }

      const data = await resp.json();
      return { ok: true, data };
    } catch (e) {
      const errorCode = e?.errorCode || "transport_error";
      if (errorCode === "parse_error") { _authCache = null; _authCacheTime = 0; }
      return { ok: false, errorCode };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "spphPageBridgeRequest" || !msg.gameName) return false;

    handleBridgeRequest(msg.gameName).then((result) => {
      sendResponse(result);
    });

    return true;
  });
})();
