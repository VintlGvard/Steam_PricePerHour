import { eventBus, EVENT_NAMES } from "./events.js";

async function request(message) {
  eventBus.emit(EVENT_NAMES.API_REQUEST, message);
  let result;
  try {
    result = await chrome.runtime.sendMessage(message);
  } catch {
    result = { ok: false, errorCode: "network_error" };
  }
  result ||= { ok: false, errorCode: "network_error" };
  eventBus.emit(EVENT_NAMES.API_RESPONSE, result);
  return result;
}

export function fetchPlaytime(steamAppId) {
  return request({ type: "spphBySteamApp", steamAppId });
}

export function fetchPlaytimeBatch(steamAppIds) {
  return request({ type: "spphBatchRequest", steamAppIds });
}
