(() => {
  "use strict";

  const SETTINGS_KEY = "spph_settings";
  const SETTINGS_KEY_LEGACY = "hltb_settings";
  const MIGRATION_MARKER_KEY = "spph_default_mode_migrated_v1";
  const VALID_MODES = ["main", "plus", "completionist"];
  const VALID_LANGUAGES = ["ru", "en"];

  const DEFAULTS = {
    enabled: true,
    valueMode: "main",
    acceptablePrice: 20,
    language: "en",
  };

  const I18N = {
    en: {
      title: "Steam PricePerHour",
      subtitle: "Smart value insights for Steam",
      "toggle-on": "Calculation enabled",
      "toggle-on-hint": "Cache + data updates",
      "toggle-off": "Cache only",
      "toggle-off-hint": "Network disabled, using cached data only",
      "toggle-aria": "Toggle calculation",
      "section-value-mode": "Value mode",
      "aria-value-mode": "Value mode",
      "mode-main-title": "Story",
      "mode-main-desc": "Main story",
      "mode-plus-title": "Story + Extras",
      "mode-plus-desc": "Story + additional content",
      "mode-completionist-desc": "Full completion",
      "section-acceptable-price": "Acceptable price",
      "price-label": "Price per hour (Steam currency)",
      "scale-below": "Below your target",
      "scale-acceptable": "Your acceptable range",
      "scale-above": "Above your target",
      "price-hint": "Lower cost per hour is better. The center band is your acceptable \u00b120% target range.",
      "section-display": "Display",
      "language-label": "Language",
      "btn-cache": "Clear cache",
      "footer-info": "All settings are saved automatically.",
      "footer-developed-by": "Developed by",
    },
    ru: {
      title: "Steam PricePerHour",
      subtitle: "\u0423\u043C\u043D\u044B\u0435 \u0446\u0435\u043D\u043E\u0432\u044B\u0435 \u0438\u043D\u0441\u0430\u0439\u0442\u044B \u0434\u043B\u044F Steam",
      "toggle-on": "\u0420\u0430\u0441\u0447\u0451\u0442 \u0432\u043A\u043B\u044E\u0447\u0451\u043D",
      "toggle-on-hint": "\u041A\u044D\u0448 + \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0445",
      "toggle-off": "\u0422\u043E\u043B\u044C\u043A\u043E \u043A\u044D\u0448",
      "toggle-off-hint": "\u0421\u0435\u0442\u044C \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F, \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437 \u043A\u044D\u0448\u0430",
      "toggle-aria": "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0440\u0430\u0441\u0447\u0451\u0442",
      "section-value-mode": "\u0420\u0435\u0436\u0438\u043C \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u0438",
      "aria-value-mode": "\u0420\u0435\u0436\u0438\u043C \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u0438",
      "mode-main-title": "\u0421\u044E\u0436\u0435\u0442",
      "mode-main-desc": "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0441\u044E\u0436\u0435\u0442",
      "mode-plus-title": "\u0421\u044E\u0436\u0435\u0442 + \u0434\u043E\u043F.",
      "mode-plus-desc": "\u0421\u044E\u0436\u0435\u0442 + \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435",
      "mode-completionist-desc": "\u041F\u043E\u043B\u043D\u043E\u0435 \u043F\u0440\u043E\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435",
      "section-acceptable-price": "\u0414\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u0446\u0435\u043D\u0430",
      "price-label": "\u0426\u0435\u043D\u0430 \u0437\u0430 \u0447\u0430\u0441 (\u0432\u0430\u043B\u044E\u0442\u0430 Steam)",
      "scale-below": "\u041d\u0438\u0436\u0435 \u0432\u0430\u0448\u0435\u0433\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f",
      "scale-acceptable": "\u0412\u0430\u0448 \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u044b\u0439 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d",
      "scale-above": "\u0412\u044b\u0448\u0435 \u0432\u0430\u0448\u0435\u0433\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f",
      "price-hint": "\u0427\u0435\u043c \u043d\u0438\u0436\u0435 \u0446\u0435\u043d\u0430 \u0437\u0430 \u0447\u0430\u0441, \u0442\u0435\u043c \u043b\u0443\u0447\u0448\u0435. \u0426\u0435\u043d\u0442\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u0437\u043e\u043d\u0430 \u2014 \u0432\u0430\u0448 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u044b\u0445 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439 \u00b120%.",
      "section-display": "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435",
      "language-label": "\u042F\u0437\u044B\u043A",
      "btn-cache": "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u043A\u044D\u0448",
      "footer-info": "\u0412\u0441\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u043D\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
      "footer-developed-by": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E",
    },
  };

  const STATUS_MSG = {
    en: {
      saved: "Saved",
      cacheEmpty: "Cache is empty",
      cacheCleared: "Cleared keys: ",
      errorLoad: "Error loading settings",
      errorSave: "Error saving settings",
      errorCache: "Error clearing cache",
    },
    ru: {
      saved: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E",
      cacheEmpty: "\u041A\u044D\u0448 \u043F\u0443\u0441\u0442",
      cacheCleared: "\u041E\u0447\u0438\u0449\u0435\u043D\u043E \u043A\u043B\u044E\u0447\u0435\u0439: ",
      errorLoad: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A",
      errorSave: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
      errorCache: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u043A\u044D\u0448\u0430",
    },
  };

  let _currentLang = "en";
  let _currentEnabled = true;

  const els = {
    toggleBtn: document.getElementById("toggle-enabled"),
    toggleText: document.getElementById("toggle-text"),
    toggleHint: document.getElementById("toggle-hint"),
    statusPill: document.getElementById("status-pill"),
    modeMain: document.getElementById("mode-main"),
    modePlus: document.getElementById("mode-plus"),
    modeCompletionist: document.getElementById("mode-completionist"),
    language: document.getElementById("select-language"),
    acceptable: document.getElementById("input-acceptable"),
    cache: document.getElementById("btn-cache"),
    status: document.getElementById("popup-status"),
  };

  function resolveLang(setting) {
    if (setting === "ru") return "ru";
    if (setting === "en") return "en";
    return DEFAULTS.language;
  }

  function t(key) {
    var dict = I18N[_currentLang];
    return dict && dict[key] != null ? dict[key] : key;
  }

  function st(key) {
    var dict = STATUS_MSG[_currentLang];
    return dict && dict[key] != null ? dict[key] : key;
  }

  function clamp(val, min, max) {
    var n = Number(val);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.className = isError
      ? "popup__status popup__status--error"
      : "popup__status";
  }

  function applyLocale(lang) {
    _currentLang = lang;
    document.documentElement.lang = lang;

    var dict = I18N[lang];
    if (dict) {
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var key = el.getAttribute("data-i18n");
        if (key && dict[key] != null) el.textContent = dict[key];
      });
      document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-aria");
        if (key && dict[key] != null) el.setAttribute("aria-label", dict[key]);
      });
    }

    updateToggleUI(_currentEnabled);
  }

  function updateToggleUI(enabled) {
    _currentEnabled = enabled;
    els.toggleBtn.setAttribute("aria-checked", String(enabled));
    if (enabled) {
      els.toggleText.textContent = t("toggle-on");
      els.toggleHint.textContent = t("toggle-on-hint");
      els.statusPill.textContent = "ON";
      els.statusPill.className = "popup__pill popup__pill--on";
    } else {
      els.toggleText.textContent = t("toggle-off");
      els.toggleHint.textContent = t("toggle-off-hint");
      els.statusPill.textContent = "OFF";
      els.statusPill.className = "popup__pill popup__pill--off";
    }
  }

  function toggleEnabled() {
    updateToggleUI(!_currentEnabled);
    save(true);
  }

  async function load() {
    try {
      var data = await chrome.storage.local.get([SETTINGS_KEY, SETTINGS_KEY_LEGACY, MIGRATION_MARKER_KEY]);
      var s = {};
      if (data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === "object") {
        s = data[SETTINGS_KEY];
      } else if (data[SETTINGS_KEY_LEGACY] && typeof data[SETTINGS_KEY_LEGACY] === "object") {
        s = data[SETTINGS_KEY_LEGACY];
      }

      if (!data[MIGRATION_MARKER_KEY]) {
        s.valueMode = "main";
        s.showMain = true;
        s.showPlus = false;
        s.showCompletionist = false;
        await chrome.storage.local.set({
          [SETTINGS_KEY]: s,
          [MIGRATION_MARKER_KEY]: true,
        });
      }

      var enabled = s.enabled !== false;
      updateToggleUI(enabled);

      var mode = VALID_MODES.includes(s.valueMode) ? s.valueMode : "main";
      els.modeMain.checked = mode === "main";
      els.modePlus.checked = mode === "plus";
      els.modeCompletionist.checked = mode === "completionist";

      var langSetting = VALID_LANGUAGES.includes(s.language)
        ? s.language
        : resolveLang(s.language);
      els.language.value = langSetting;

      var legacyTarget =
        s.targetThreshold ??
        s.targetRubThreshold ??
        s.goodRubThreshold ??
        DEFAULTS.acceptablePrice;
      var acceptablePrice =
        s.acceptablePrice != null
          ? s.acceptablePrice
          : s.normalTo != null
            ? s.normalTo
            : legacyTarget;

      els.acceptable.value = clamp(acceptablePrice, 0, 1000000);

      applyLocale(resolveLang(langSetting));
    } catch {
      setStatus(st("errorLoad"), true);
    }
  }

  function validate() {
    var mode =
      (els.modeMain.checked && "main") ||
      (els.modePlus.checked && "plus") ||
      (els.modeCompletionist.checked && "completionist") ||
      "main";

    var acceptablePrice = clamp(els.acceptable.value, 0, 1000000);

    return {
      enabled: _currentEnabled,
      valueMode: mode,
      showMain: mode === "main",
      showPlus: mode === "plus",
      showCompletionist: mode === "completionist",
      language: VALID_LANGUAGES.includes(els.language.value)
        ? els.language.value
        : resolveLang(els.language.value),
      acceptablePrice,
    };
  }

  async function save(silent) {
    var settings = validate();
    try {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      if (els.acceptable.value !== "") {
        els.acceptable.value = settings.acceptablePrice;
      }
      if (!silent) setStatus(st("saved"), false);
    } catch {
      if (!silent) setStatus(st("errorSave"), true);
    }
  }

  async function clearCache() {
    try {
      var all = await chrome.storage.local.get(null);
      var keys = Object.keys(all).filter(
        (k) =>
          k.startsWith("spph_cache_") ||
          k.startsWith("spph_nf_") ||
          k.startsWith("hltb_cache_") ||
          k.startsWith("hltb_nf_"),
      );
      if (keys.length === 0) {
        setStatus(st("cacheEmpty"), false);
        return;
      }
      await chrome.storage.local.remove(keys);
      setStatus(st("cacheCleared") + keys.length, false);
    } catch {
      setStatus(st("errorCache"), true);
    }
  }

  els.toggleBtn.addEventListener("click", toggleEnabled);
  els.cache.addEventListener("click", clearCache);

  els.modeMain.addEventListener("change", function () { save(true); });
  els.modePlus.addEventListener("change", function () { save(true); });
  els.modeCompletionist.addEventListener("change", function () { save(true); });

  els.acceptable.addEventListener("change", function () { save(true); });
  els.acceptable.addEventListener("blur", function () { save(true); });

  var _acceptableDebounceTimer = null;
  els.acceptable.addEventListener("input", function () {
    clearTimeout(_acceptableDebounceTimer);
    _acceptableDebounceTimer = setTimeout(function () { save(true); }, 300);
  });

  els.language.addEventListener("change", function () {
    applyLocale(resolveLang(els.language.value));
    save(true);
  });

  load();
})();
