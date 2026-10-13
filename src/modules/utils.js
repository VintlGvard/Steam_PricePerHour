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

export function numericId(val) {
  const n = Number(val);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
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
    if (inThrottle) return;
    inThrottle = true;
    setTimeout(() => {
      inThrottle = false;
      fn.apply(this, args);
    }, limit);
  };
}

export function isAppPage() {
  return /\/app\/\d+/.test(location.pathname);
}

export function isBundlePage() {
  return /\/bundle\/\d+/.test(location.pathname);
}
