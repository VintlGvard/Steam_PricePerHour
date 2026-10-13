const EVENT_NAMES = {
  SETTINGS_CHANGED: 'spph:settings:changed',
  CACHE_UPDATED: 'spph:cache:updated',
  BADGE_CREATED: 'spph:badge:created',
  BADGE_UPDATED: 'spph:badge:updated',
  CARD_PROCESSED: 'spph:card:processed',
  API_REQUEST: 'spph:api:request',
  API_RESPONSE: 'spph:api:response',
};

class EventBus {
  constructor() {
    this._target = document || window;
  }

  emit(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      cancelable: false,
    });
    this._target.dispatchEvent(event);
  }

  on(eventName, handler) {
    this._target.addEventListener(eventName, handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    this._target.removeEventListener(eventName, handler);
  }

  once(eventName, handler) {
    const wrapper = (e) => {
      handler(e);
      this.off(eventName, wrapper);
    };
    this.on(eventName, wrapper);
  }
}

export const eventBus = new EventBus();
export { EVENT_NAMES };
