export function secondsToHours(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return +(n / 3600).toFixed(2);
}

export function fmtH(h) {
  return Number(h).toFixed(2);
}

export function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

export function normalizeName(raw) {
  if (!raw) return '';
  return raw
    .replace(/[\u2122\u00AE\u00A9]/g, '')
    .replace(/[:;!?.\-,/\\'"„""–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function numericId(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function isSteamUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' &&
      (u.hostname === 'store.steampowered.com' || u.hostname === 'steampowered.com');
  } catch {
    return false;
  }
}

export function extractAppIdFromUrl(url) {
  const match = url.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

export function isAppPage() {
  return /\/app\/\d+/.test(location.pathname);
}

export function isBundlePage() {
  return /\/bundle\/\d+/.test(location.pathname);
}
