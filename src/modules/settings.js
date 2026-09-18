import { eventBus, EVENT_NAMES } from './events.js';

const SETTINGS_KEY = 'spph_settings';

const VALID_MODES = ['main', 'plus', 'completionist'];
const VALID_LANGUAGES = ['ru', 'en'];

const DEFAULTS = {
  valueMode: 'main',
  acceptablePrice: 0.5,
  language: 'en',
};

class SettingsManager {
  constructor() {
    this._settings = { ...DEFAULTS };
    this._loaded = false;
  }

  get settings() {
    return { ...this._settings };
  }

  get valueMode() {
    return this._settings.valueMode;
  }

  get acceptablePrice() {
    return this._settings.acceptablePrice;
  }

  get language() {
    return this._settings.language;
  }

  clampSetting(val, min, max) {
    const n = Number(val);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
  }

  parseSettings(raw) {
    const isRu = /^ru/.test(navigator.language || '');

    const legacyFallback = this.clampSetting(
      raw.targetThreshold ?? raw.targetRubThreshold ?? raw.goodRubThreshold ?? DEFAULTS.acceptablePrice,
      0,
      1000000,
    );

    let acceptablePrice;
    if (raw.acceptablePrice != null) {
      acceptablePrice = this.clampSetting(raw.acceptablePrice, 0, 1000000);
    } else if (raw.normalTo != null) {
      acceptablePrice = this.clampSetting(raw.normalTo, 0, 1000000);
    } else {
      acceptablePrice = legacyFallback;
    }

    let mode = VALID_MODES.includes(raw.valueMode) ? raw.valueMode : null;
    if (!mode) {
      if (raw.showCompletionist === true) {
        mode = 'completionist';
      } else if (raw.showPlus !== false) {
        mode = 'plus';
      } else {
        mode = 'main';
      }
    }

    return {
      valueMode: mode,
      acceptablePrice,
      language: VALID_LANGUAGES.includes(raw.language)
        ? raw.language
        : (isRu ? 'ru' : 'en'),
    };
  }

  async load() {
    try {
      const data = await chrome.storage.local.get([SETTINGS_KEY]);
      const raw = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object'
        ? data[SETTINGS_KEY]
        : null;

      if (raw) {
        this._settings = this.parseSettings(raw);
      }
      this._loaded = true;
    } catch {}
  }

  async save(newSettings) {
    const validated = this.validate(newSettings);
    this._settings = validated;

    try {
      await chrome.storage.local.set({ [SETTINGS_KEY]: validated });
      eventBus.emit(EVENT_NAMES.SETTINGS_CHANGED, { settings: validated });
    } catch {}
  }

  validate(settings) {
    return {
      valueMode: VALID_MODES.includes(settings.valueMode) ? settings.valueMode : DEFAULTS.valueMode,
      acceptablePrice: this.clampSetting(settings.acceptablePrice ?? DEFAULTS.acceptablePrice, 0, 1000000),
      language: VALID_LANGUAGES.includes(settings.language) ? settings.language : DEFAULTS.language,
    };
  }

  update(partial) {
    const merged = { ...this._settings, ...partial };
    return this.save(merged);
  }

  listenForChanges(handler) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[SETTINGS_KEY]) {
        const changeData = changes[SETTINGS_KEY];
        const raw = changeData.newValue;
        if (raw && typeof raw === 'object') {
          this._settings = this.parseSettings(raw);
          handler(this._settings);
        }
      }
    });
  }
}

export const settingsManager = new SettingsManager();
export { DEFAULTS, VALID_MODES, VALID_LANGUAGES };
