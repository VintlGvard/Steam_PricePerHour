import { settingsManager } from "./settings.js";
import { fmtH } from "./utils.js";
import { eventBus, EVENT_NAMES } from "./events.js";

const _badgeMeta = new WeakMap();

function getLabels() {
  const lang = settingsManager.language;
  if (lang === "ru") {
    return {
      hr: "ч",
      story: "Сюжет",
      plus: "Сюжет + доп.",
      completionist: "100%",
      free: "бесплатно",
      price: "Цена",
      acceptable: "Допустимо",
    };
  }
  return {
    hr: "h",
    story: "Story",
    plus: "Main + Extra",
    completionist: "100%",
    free: "free",
    price: "Price",
    acceptable: "Acceptable",
  };
}

function getErrorLabels() {
  const lang = settingsManager.language;
  if (lang === "ru") {
    return {
      auth_missing: "API-ключ не настроен — бейджи недоступны",
      auth_invalid: "Неверный API-ключ — бейджи недоступны",
      rate_limited: "Слишком много запросов — попробуйте позже",
      timeout: "Превышено время ожидания запроса",
      network_error: "Сетевая ошибка — проверьте подключение",
      invalid_response: "Некорректный ответ API",
      not_found: "Игра не найдена в базе SPPH",
      http_: "Ошибка API (HTTP)",
    };
  }
  return {
    auth_missing: "API key is not configured — badges unavailable",
    auth_invalid: "Invalid API key — badges unavailable",
    rate_limited: "Too many requests — try again later",
    timeout: "Request timed out",
    network_error: "Network error — check your connection",
    invalid_response: "Invalid API response",
    not_found: "Game not found in the SPPH database",
    http_: "API error (HTTP)",
  };
}

export function createBadge(spphResult, priceInfo) {
  const badge = document.createElement("div");
  badge.className = "spph-ratio-badge";
  badge.setAttribute("role", "status");
  badge.setAttribute("tabindex", "0");

  const labels = getLabels();
  const mode = settingsManager.valueMode;

  const modeKey = mode === "plus" ? "plus" : mode === "completionist" ? "completionist" : "main";
  const modeLabel =
    mode === "plus" ? labels.plus : mode === "completionist" ? labels.completionist : labels.story;
  const selectedHours = spphResult ? spphResult[modeKey] || 0 : 0;

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

  const ratioFmt = new Intl.NumberFormat(settingsManager.language === "ru" ? "ru" : "en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (priceInfo && priceInfo.isFree) {
    const ratioSpan = document.createElement("span");
    ratioSpan.className = "spph-ratio-badge__ratio";
    ratioSpan.textContent = "0/" + labels.hr + " · " + labels.free;
    badge.appendChild(ratioSpan);
    badge.classList.add("spph-ratio-badge--dynamic");
    badge.style.setProperty("--spph-hue", "120");
    badge.style.setProperty("--spph-saturation", "65%");
    badge.style.setProperty("--spph-lightness", "45%");
    badge.style.setProperty("--spph-intensity", "0.3");
  } else if (priceInfo && selectedHours > 0 && priceInfo.amount > 0) {
    const ratioSpan = document.createElement("span");
    ratioSpan.className = "spph-ratio-badge__ratio";
    const ratio = +(priceInfo.amount / selectedHours).toFixed(2);
    const curr = priceInfo.formattedCurrency;
    ratioSpan.textContent = curr + ratioFmt.format(ratio) + "/" + labels.hr;
    badge.appendChild(ratioSpan);

    if (priceInfo.currencyCode) {
      const acceptable = settingsManager.acceptablePrice;
      const lower = acceptable * 0.8;
      const upper = acceptable * 1.2;
      const redMax = acceptable * 3;
      let hue, saturation, lightness, intensity;

      if (ratio <= lower) {
        hue = 120;
        saturation = 65;
        lightness = 45;
        intensity = 0.3;
      } else if (ratio <= upper) {
        const t = (ratio - lower) / (upper - lower);
        hue = 120 - t * 80;
        saturation = 65 + t * 10;
        lightness = 45 + t * 5;
        intensity = 0.3 + t * 0.15;
      } else if (ratio <= redMax) {
        const t = (ratio - upper) / (redMax - upper);
        hue = 40 - t * 40;
        saturation = 75 - t * 10;
        lightness = 50 - t * 5;
        intensity = 0.45 + t * 0.15;
      } else {
        hue = 0;
        saturation = 65;
        lightness = 45;
        intensity = 0.6;
      }

      badge.style.setProperty("--spph-hue", String(hue));
      badge.style.setProperty("--spph-saturation", saturation + "%");
      badge.style.setProperty("--spph-lightness", lightness + "%");
      badge.style.setProperty("--spph-intensity", String(intensity));
      badge.classList.add("spph-ratio-badge--dynamic");
    }
  } else {
    const ratioSpan = document.createElement("span");
    ratioSpan.className = "spph-ratio-badge__ratio";
    ratioSpan.textContent = "—";
    badge.appendChild(ratioSpan);
    badge.classList.add("spph-ratio-badge--na");
  }

  const tipLines = [];
  if (spphResult && !spphResult.error) {
    tipLines.push(labels.story + ": " + fmtH(spphResult.main || 0) + labels.hr);
    tipLines.push(labels.plus + ": " + fmtH(spphResult.plus || 0) + labels.hr);
    tipLines.push(labels.completionist + ": " + fmtH(spphResult.completionist || 0) + labels.hr);
  }
  if (priceInfo && !priceInfo.isFree && priceInfo.amount > 0) {
    const curr = priceInfo.formattedCurrency;
    tipLines.push(labels.price + ": " + curr + ratioFmt.format(priceInfo.amount));
    if (priceInfo.currencyCode) {
      const modeInfo =
        mode === "completionist" ? labels.completionist : mode === "plus" ? labels.plus : labels.story;
      tipLines.push(
        labels.acceptable +
          ": " +
          curr +
          ratioFmt.format(settingsManager.acceptablePrice) +
          "/" +
          labels.hr +
          " ±20%" +
          " (" +
          modeInfo +
          ")",
      );
    }
  }
  if (tipLines.length) {
    badge.setAttribute("title", tipLines.join(" · "));
  }

  _badgeMeta.set(badge, { spphData: spphResult, priceInfo });

  eventBus.emit(EVENT_NAMES.BADGE_CREATED, { badge, spphResult, priceInfo });

  return badge;
}

export function createPlaceholderBadge() {
  const badge = document.createElement("div");
  badge.className = "spph-ratio-badge spph-ratio-badge--loading";
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-busy", "true");

  const timeSpan = document.createElement("span");
  timeSpan.className = "spph-ratio-badge__time";
  timeSpan.textContent = "Playtime: …";
  badge.appendChild(timeSpan);

  const ratioSpan = document.createElement("span");
  ratioSpan.className = "spph-ratio-badge__ratio";
  ratioSpan.textContent = "…";
  badge.appendChild(ratioSpan);

  return badge;
}

export function createErrorBadge(errorCode) {
  const badge = document.createElement("div");
  badge.className = "spph-ratio-badge spph-ratio-badge--na";
  badge.setAttribute("role", "status");
  badge.setAttribute("tabindex", "0");

  const labels = getLabels();
  const mode = settingsManager.valueMode;
  const modeLabel =
    mode === "plus" ? labels.plus : mode === "completionist" ? labels.completionist : labels.story;

  const timeSpan = document.createElement("span");
  timeSpan.className = "spph-ratio-badge__time";
  const labelSpan = document.createElement("span");
  labelSpan.className = "spph-ratio-badge__time-label";
  labelSpan.textContent = modeLabel + ":";
  timeSpan.appendChild(labelSpan);
  timeSpan.appendChild(document.createTextNode(" N/A"));
  badge.appendChild(timeSpan);

  const ratioSpan = document.createElement("span");
  ratioSpan.className = "spph-ratio-badge__ratio";
  ratioSpan.textContent = "—";
  badge.appendChild(ratioSpan);

  const errorLabels = getErrorLabels();
  const errorText =
    errorLabels[errorCode] ||
    (errorCode && errorCode.startsWith("http_")
      ? errorLabels.http_ + String(errorCode).slice("http_".length)
      : errorLabels.auth_missing);
  badge.setAttribute("title", errorText);

  return badge;
}

export function insertBadgeInPurchaseArea(wrapper, badge) {
  const purchaseArea =
    wrapper.querySelector(".game_area_purchase_game") ||
    wrapper.querySelector(".game_area_purchase_game_wrapper") ||
    wrapper;

  if (purchaseArea && purchaseArea.parentNode) {
    purchaseArea.parentNode.insertBefore(badge, purchaseArea);
  } else {
    wrapper.appendChild(badge);
  }
}

export function getBadgeMeta(badge) {
  return _badgeMeta.get(badge) || null;
}

export function setBadgeMeta(badge, meta) {
  _badgeMeta.set(badge, meta);
}
