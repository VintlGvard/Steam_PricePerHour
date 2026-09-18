import { debounce, throttle } from './utils.js';
import { eventBus } from './events.js';

const OBSERVER_DEBOUNCE_MS = 500;
const OBSERVER_THROTTLE_MS = 1000;

class DOMObserver {
  constructor() {
    this._observer = null;
    this._processCallback = null;

    this._debouncedProcess = debounce(() => this._processAll(), OBSERVER_DEBOUNCE_MS);
    this._throttledProcess = throttle(() => this._debouncedProcess(), OBSERVER_THROTTLE_MS);
  }

  start(processCallback) {
    this._processCallback = processCallback;

    this._observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) {
        this._throttledProcess();
      }
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this._throttledProcess();
  }

  stop() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  _processAll() {
    if (this._processCallback) {
      try {
        this._processCallback();
      } catch {}
    }

    eventBus.emit('spph:observer:processed');
  }
}

export const domObserver = new DOMObserver();
export { OBSERVER_DEBOUNCE_MS, OBSERVER_THROTTLE_MS };
