const CURRENCY_TOKENS = [
  ['R$', 'BRL'],
  ['zł', 'PLN'],
  ['CHF', 'CHF'],
  ['kr', 'SEK'],
  ['₽', 'RUB'],
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['₴', 'UAH'],
  ['₸', 'KZT'],
  ['₹', 'INR'],
  ['₩', 'KRW'],
  ['₺', 'TRY'],
  ['R', 'ZAR'],
];

const CURRENCY_CODES = [
  'RUB', 'USD', 'EUR', 'GBP', 'JPY', 'UAH', 'KZT', 'INR',
  'PLN', 'BRL', 'CHF', 'SEK', 'TRY', 'ZAR', 'KRW', 'CNY',
  'AUD', 'CAD', 'NZD', 'CZK', 'HUF', 'NOK', 'DKK', 'THB',
  'IDR', 'MYR', 'PHP', 'SGD', 'HKD', 'TWD', 'MXN',
];

const SELECTORS = {
  searchRow: '.search_result_row',
  saleCapsule: 'a.sale_capsule_target',
  spotlight: '.home_area_spotlight',
  discountFallback: '.discount_prices',
  appPurchaseWrapper: '.game_area_purchase_game_wrapper',
  appPurchaseGame: '.game_area_purchase_game',
  dlcRow: '.game_area_dlc_row[data-ds-appid]',
};

function matchesCurrencyToken(text, token) {
  if (/^[a-zA-Z]+$/.test(token)) {
    return new RegExp('\\b' + token + '\\b', 'i').test(text);
  }
  return text.includes(token);
}

export function parsePriceText(text) {
  let currencySymbol = '';
  let currencyCode = '';

  for (const [sym, code] of CURRENCY_TOKENS) {
    if (matchesCurrencyToken(text, sym)) {
      currencySymbol = sym;
      currencyCode = code;
      break;
    }
  }
  if (!currencyCode) {
    for (const code of CURRENCY_CODES) {
      if (new RegExp('\\b' + code + '\\b', 'i').test(text)) {
        currencyCode = code;
        break;
      }
    }
  }

  const formattedCurrency = currencySymbol || currencyCode || '¤';

  let numText = text;
  if (currencySymbol) {
    numText = numText.split(currencySymbol).join('');
  }
  if (currencyCode) {
    numText = numText.replace(new RegExp(currencyCode, 'gi'), '');
  }
  numText = numText.replace(/\s/g, '').replace(/[^0-9.,]/g, '');
  if (!numText) {
    return null;
  }

  const lastComma = numText.lastIndexOf(',');
  const lastDot = numText.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      numText = numText.replace(/\./g, '').replace(',', '.');
    } else {
      numText = numText.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const trailing = numText.length - lastComma - 1;
    if (trailing <= 2) {
      numText =
        numText.substring(0, lastComma) +
        '.' +
        numText.substring(lastComma + 1);
      numText = numText.replace(/,/g, '');
    } else {
      numText = numText.replace(/,/g, '');
    }
  } else if (lastDot >= 0) {
    const trailing = numText.length - lastDot - 1;
    if (trailing > 2) numText = numText.replace(/\./g, '');
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

export function extractPrice(card) {
  const freeCheck = (txt) => /free/i.test(txt);

  if (card.matches('.game_area_dlc_row')) {
    const dlcPriceEl = card.querySelector('.game_area_dlc_price');
    if (dlcPriceEl) {
      const txt = dlcPriceEl.textContent.trim();
      if (freeCheck(txt)) return { amount: 0, currencySymbol: '', currencyCode: '', formattedCurrency: '', isFree: true };
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }
    return null;
  }

  const discountBlock = card.querySelector('.discount_prices');
  if (discountBlock) {
    const finalEl = discountBlock.querySelector('.discount_final_price');
    if (finalEl) {
      const txt = finalEl.textContent.trim();
      if (freeCheck(txt))
        {return {
          amount: 0,
          currencySymbol: '',
          currencyCode: '',
          formattedCurrency: '',
          isFree: true,
        };}
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }
  }

  const regularEl = card.querySelector('.game_purchase_price');
  if (regularEl) {
    const txt = regularEl.textContent.trim();
    if (freeCheck(txt))
      {return {
        amount: 0,
        currencySymbol: '',
        currencyCode: '',
        formattedCurrency: '',
        isFree: true,
      };}
    const parsed = parsePriceText(txt);
    if (parsed) return parsed;
  }

  const searchEl = card.querySelector('.search_price');
  if (searchEl) {
    const searchFinal = searchEl.querySelector('.discount_final_price');
    if (searchFinal) {
      const finalTxt = searchFinal.textContent.trim();
      if (freeCheck(finalTxt))
        {return {
          amount: 0,
          currencySymbol: '',
          currencyCode: '',
          formattedCurrency: '',
          isFree: true,
        };}
      const finalParsed = parsePriceText(finalTxt);
      if (finalParsed) return finalParsed;
    }
    const txt = searchEl.textContent.trim();
    if (freeCheck(txt))
      {return {
        amount: 0,
        currencySymbol: '',
        currencyCode: '',
        formattedCurrency: '',
        isFree: true,
      };}
    const parsed = parsePriceText(txt);
    if (parsed) return parsed;
  }

  const dataPriceEl = card.querySelector('[data-price-final]');
  if (dataPriceEl) {
    const hqEl = dataPriceEl.querySelector('[class*="HQzBzl6lqI"]');
    if (hqEl) {
      const txt = hqEl.textContent.trim();
      if (freeCheck(txt))
        {return {
          amount: 0,
          currencySymbol: '',
          currencyCode: '',
          formattedCurrency: '',
          isFree: true,
        };}
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }
    const cjEl = dataPriceEl.querySelector('[class*="Cj7J5QHbL"]');
    if (cjEl) {
      const txt = cjEl.textContent.trim();
      if (freeCheck(txt))
        {return {
          amount: 0,
          currencySymbol: '',
          currencyCode: '',
          formattedCurrency: '',
          isFree: true,
        };}
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }
    const selfTxt = dataPriceEl.textContent.trim();
    if (selfTxt) {
      if (freeCheck(selfTxt))
        {return {
          amount: 0,
          currencySymbol: '',
          currencyCode: '',
          formattedCurrency: '',
          isFree: true,
        };}
      const parsed = parsePriceText(selfTxt);
      if (parsed) return parsed;
    }
    const minorUnits = Number(dataPriceEl.getAttribute('data-price-final'));
    if (Number.isFinite(minorUnits)) {
      if (minorUnits === 0) {
        return {
          amount: 0,
          currencySymbol: '',
          currencyCode: '',
          formattedCurrency: '',
          isFree: true,
        };
      }
      const attrCurrency = (dataPriceEl.getAttribute('data-price-currency') || '').toUpperCase();
      const minorUnitMap = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, RWF: 0, PYG: 0, VUV: 0, BHD: 3, KWD: 3, OMR: 3 };
      if (attrCurrency && attrCurrency in minorUnitMap) {
        const dec = minorUnitMap[attrCurrency];
        return {
          amount: dec === 0 ? minorUnits : minorUnits / Math.pow(10, dec),
          currencySymbol: '',
          currencyCode: attrCurrency,
          formattedCurrency: attrCurrency,
          isFree: false,
        };
      }
      if (attrCurrency) {
        return {
          amount: minorUnits / 100,
          currencySymbol: '',
          currencyCode: attrCurrency,
          formattedCurrency: attrCurrency,
          isFree: false,
        };
      }
      return {
        amount: minorUnits,
        currencySymbol: '',
        currencyCode: '',
        formattedCurrency: '¤',
        isFree: false,
      };
    }
  }

  if (/free\s*to\s*play/i.test(card.textContent)) {
    return {
      amount: 0,
      currencySymbol: '',
      currencyCode: '',
      formattedCurrency: '',
      isFree: true,
    };
  }

  return null;
}

export function extractBundlePrice(wrapper) {
  const freeCheck = (txt) => /free/i.test(txt);
  const freePriceObj = {
    amount: 0, currencySymbol: '', currencyCode: '',
    formattedCurrency: '', isFree: true,
  };

  const yourPrice = wrapper.querySelector('.your_price');
  if (yourPrice) {
    const finalInYour = yourPrice.querySelector('.discount_final_price');
    if (finalInYour) {
      const txt = finalInYour.textContent.trim();
      if (freeCheck(txt)) return freePriceObj;
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }
    const priceInYour = yourPrice.querySelector('.game_purchase_price');
    if (priceInYour) {
      const txt = priceInYour.textContent.trim();
      if (freeCheck(txt)) return freePriceObj;
      const parsed = parsePriceText(txt);
      if (parsed) return parsed;
    }
  }

  const discFinal = wrapper.querySelector('.discount_final_price');
  if (discFinal) {
    const txt = discFinal.textContent.trim();
    if (freeCheck(txt)) return freePriceObj;
    const parsed = parsePriceText(txt);
    if (parsed) return parsed;
  }

  const regular = wrapper.querySelector('.game_purchase_price');
  if (regular) {
    const txt = regular.textContent.trim();
    if (freeCheck(txt)) return freePriceObj;
    const parsed = parsePriceText(txt);
    if (parsed) return parsed;
  }

  const dataEl = wrapper.querySelector('[data-price-final]');
  if (dataEl) {
    const minorUnits = Number(dataEl.getAttribute('data-price-final'));
    if (minorUnits === 0) return freePriceObj;
    if (Number.isFinite(minorUnits)) {
      const attrCurrency = (dataEl.getAttribute('data-price-currency') || '').toUpperCase();
      const minorUnitMap = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, RWF: 0, PYG: 0, VUV: 0, BHD: 3, KWD: 3, OMR: 3 };
      if (attrCurrency && attrCurrency in minorUnitMap) {
        const dec = minorUnitMap[attrCurrency];
        return {
          amount: dec === 0 ? minorUnits : minorUnits / Math.pow(10, dec),
          currencySymbol: '',
          currencyCode: attrCurrency,
          formattedCurrency: attrCurrency, isFree: false,
        };
      }
      if (attrCurrency) {
        return {
          amount: minorUnits / 100, currencySymbol: '', currencyCode: attrCurrency,
          formattedCurrency: attrCurrency, isFree: false,
        };
      }
      return {
        amount: minorUnits, currencySymbol: '', currencyCode: '',
        formattedCurrency: '¤', isFree: false,
      };
    }
  }

  return null;
}

export function extractSteamAppId(card) {
  const anchors = card.querySelectorAll("a[href*='/app/']");
  for (const a of anchors) {
    const m = a.href.match(/\/app\/(\d+)/);
    if (m) return m[1];
  }
  if (card.tagName === 'A' && card.href) {
    const m = card.href.match(/\/app\/(\d+)/);
    if (m) return m[1];
  }
  const appIdAttr = card.getAttribute('data-ds-appid') ||
    card.getAttribute('data-appid');
  if (appIdAttr) return appIdAttr;
  return null;
}

export function extractTitle(card) {
  if (card.matches('.game_area_dlc_row')) {
    const dlcNameEl = card.querySelector('.game_area_dlc_name');
    if (dlcNameEl) {
      const clone = dlcNameEl.cloneNode(true);
      const highlightReason = clone.querySelector('.dlc_highlight_reason');
      if (highlightReason) highlightReason.remove();
      const txt = clone.textContent.trim();
      if (txt) return txt;
    }
  }

  let el = card.querySelector('.title, .search_name, .I8vuMMV-osE-, a[class*="I8vuMMV"]');
  if (!el)
    {el = card.querySelector("a[href*='/app/'] .title");}
  if (!el) el = card.querySelector('.discount_name');
  if (!el) el = card.querySelector('h4, h3, .game_name, [class*="name"]');
  if (!el) {
    const img = card.querySelector("a[href*='/app/'] img[alt]");
    if (img) {
      const alt = img.getAttribute('alt');
      if (alt && alt.trim()) return alt.trim();
    }
  }
  if (!el) {
    const a = card.querySelector("a[href*='/app/']");
    if (a) {
      const label = a.getAttribute('aria-label') || a.getAttribute('title');
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
    const attr = card.getAttribute('aria-label') || card.getAttribute('data-name') || card.getAttribute('title');
    if (attr && attr.trim()) return attr.trim();
  }
  if (!el) return null;
  return el.textContent.trim();
}

export function findPriceAnchor(card, isSpotlight) {
  if (card.matches('.game_area_dlc_row')) {
    return card.querySelector('.game_area_dlc_price') || null;
  }

  if (card.closest('.bundle_package_item')) {
    return (
      card.querySelector('.discount_block') ||
      card.querySelector('.discount_prices') ||
      null
    );
  }
  if (isSpotlight) {
    return (
      card.querySelector('.discount_prices') ||
      card.querySelector('.discount_final_price') ||
      card.querySelector('[data-price-final]') ||
      card.querySelector("[class*='price']") ||
      null
    );
  }
  return (
    card.querySelector('.discount_prices') ||
    card.querySelector('.game_purchase_price') ||
    card.querySelector('[data-price-final]') ||
    card.querySelector("[class*='price']") ||
    null
  );
}

export function extractAppPageAppId(wrapper) {
  if (wrapper) {
    const fromWrapper = extractSteamAppId(wrapper);
    if (fromWrapper) return fromWrapper;
  }
  const m = location.pathname.match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

export function extractAppPageTitle() {
  let el = document.querySelector('.apphub_AppName');
  if (el) {
    const t = el.textContent.trim();
    if (t) return t;
  }
  el = document.querySelector('h1');
  if (el) {
    const t = el.textContent.trim();
    if (t) return t;
  }
  const og = document.querySelector('meta[property="og:title"]');
  if (og) {
    const c = og.getAttribute('content');
    if (c) return c.trim();
  }
  if (document.title) {
    return document.title
      .replace(/\s*[:\-–—]\s*Steam.*$/i, '')
      .replace(/\s*on\s+Steam\s*$/i, '')
      .trim();
  }
  return null;
}

export { SELECTORS, CURRENCY_TOKENS, CURRENCY_CODES };
