export const LS_SESSION_KEY = "poker_session_json";
export const LS_PLAYERS_KEY = "poker_players_json";

export function readLocalOverride(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeLocalOverride(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // silent fallback
  }
}

export function saveSessionPlayersOverrides(sessionJson, playersJson) {
  writeLocalOverride(LS_SESSION_KEY, sessionJson);
  writeLocalOverride(LS_PLAYERS_KEY, playersJson);
}

export async function loadJsonWithOverride(url, key) {
  const local = readLocalOverride(key);
  if (local) return local;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
