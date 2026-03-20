const DEFAULT_STACK_PER_10 = 10000;
const CHIP_CONFIG = [
  { key: "orange", label: "orange", defaultValue: 50 },
  { key: "black", label: "noir", defaultValue: 100 },
  { key: "green", label: "vert", defaultValue: 500 },
  { key: "yellow", label: "jaune", defaultValue: 1000 },
  { key: "red", label: "rouge", defaultValue: 5000 },
  { key: "white", label: "blanc", defaultValue: 10000 }
];

const LOCAL_DRAFTS_STORAGE = "poker_live_stack_drafts_v2";

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const API_BASES = window.location.origin?.startsWith("http")
  ? (isLocalhost ? ["", "http://localhost:8000"] : [""])
  : ["http://localhost:8000"];
const ADMIN_KEY_STORAGE = "poker_admin_key";
const ADMIN_DEFAULT_KEY = "poker_admin_local";
const ADMIN_CODE_STORAGE = "poker_admin_code";

const preferredSessionIdFromUrl = String(new URLSearchParams(window.location.search).get("session_id") || "").trim();

const els = {
  playerNameInput: document.getElementById("playerNameInput"),
  blindAmountInput: document.getElementById("blindAmountInput"),
  ongoingPlayerSelect: document.getElementById("ongoingPlayerSelect"),
  validateBtn: document.getElementById("validateBtn"),
  resetBtn: document.getElementById("resetBtn"),
  stackTotalCell: document.getElementById("stackTotalCell"),
  stackTotalValue: document.getElementById("stackTotalValue"),
  blindsExactValue: document.getElementById("blindsExactValue"),
  blindsFullValue: document.getElementById("blindsFullValue"),
  formulaLine: document.getElementById("formulaLine"),
  ongoingSessionInfo: document.getElementById("ongoingSessionInfo"),
  ongoingPlayerReminder: document.getElementById("ongoingPlayerReminder"),
  validationStatus: document.getElementById("validationStatus")
};

const state = {
  preferredSessionId: preferredSessionIdFromUrl,
  ongoingSession: null,
  ongoingPlayers: [],
  selectedOngoingPlayerId: "",
  liveStacksByPlayerId: new Map(),
  lastSavedSignatureByPlayerId: new Map(),
  draftByPlayerId: new Map(),
  autoSaveTimer: null,
  pendingAutoSavePayload: null
};

const chipRefs = CHIP_CONFIG.map((chip) => ({
  ...chip,
  valueInput: document.getElementById(`chipValue${capitalize(chip.key)}Input`),
  countInput: document.getElementById(`chipCount${capitalize(chip.key)}Input`),
  subtotalCell: document.getElementById(`chipSubtotal${capitalize(chip.key)}`)
}));

function capitalize(text) {
  const str = String(text || "");
  if (!str) return str;
  return `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;
}

function parseAmount(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseNonNegativeNumber(value, { integer = false } = {}) {
  const n = parseAmount(value);
  if (n == null || n < 0) return null;
  return integer ? Math.floor(n) : n;
}

function readNonNegativeNumber(input, { integer = false } = {}) {
  const n = parseAmount(input?.value);
  if (n == null || n <= 0) return 0;
  return integer ? Math.floor(n) : n;
}

function readNonNegativeNumberWithDefault(input, fallback, { integer = false } = {}) {
  const n = parseAmount(input?.value);
  const candidate = n == null ? fallback : n;
  if (candidate == null || !Number.isFinite(candidate) || candidate <= 0) return 0;
  return integer ? Math.floor(candidate) : candidate;
}

function formatNumber(value, decimals = 0) {
  const n = Number(value || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatTrimmed(value, maxDecimals = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  });
}

function toFixedOrEmpty(value, decimals) {
  if (value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(decimals);
}

function compareSessionIdsDesc(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
  return String(b).localeCompare(String(a), "fr", { numeric: true, sensitivity: "base" });
}

function setValidationStatus(text) {
  if (!els.validationStatus) return;
  els.validationStatus.textContent = text;
}

function sanitizeChipObject(raw, { integer = false } = {}) {
  if (raw == null || raw === "") return null;

  let parsed = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const out = {};
  for (const chip of CHIP_CONFIG) {
    const candidate = parseNonNegativeNumber(parsed[chip.key], { integer });
    if (candidate != null) {
      out[chip.key] = candidate;
    }
  }

  return Object.keys(out).length ? out : null;
}

function serializeChipObjectForSignature(raw, { integer = false } = {}) {
  const normalized = sanitizeChipObject(raw, { integer }) || {};
  const out = {};
  for (const chip of CHIP_CONFIG) {
    const value = normalized[chip.key];
    if (value == null) continue;
    out[chip.key] = integer ? Math.floor(value) : Number(value);
  }
  return JSON.stringify(out);
}

function buildPayloadSignature(payload) {
  if (!payload) return "";
  return [
    String(payload.session_id || ""),
    String(payload.player_id || ""),
    toFixedOrEmpty(payload.current_stack, 4),
    toFixedOrEmpty(payload.blind_amount, 4),
    toFixedOrEmpty(payload.blinds_remaining_exact, 6),
    serializeChipObjectForSignature(payload.chip_values_json, { integer: false }),
    serializeChipObjectForSignature(payload.chip_counts_json, { integer: true })
  ].join("|");
}

function buildStorageCompositeKey(sessionId, playerId) {
  return `${String(sessionId || "").trim()}|${String(playerId || "").trim()}`;
}

function readDraftStorageMap() {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFTS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraftStorageMap(storageMap) {
  try {
    localStorage.setItem(LOCAL_DRAFTS_STORAGE, JSON.stringify(storageMap || {}));
  } catch {
    // ignore localStorage errors
  }
}

function sanitizeNumericDraftValue(value, { integer = false, fallback = "" } = {}) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return fallback;
  const n = parseNonNegativeNumber(trimmed, { integer });
  if (n == null) return fallback;
  return String(n);
}

function createDefaultDraft(playerName = "") {
  const draft = {
    playerName: String(playerName || "").trim(),
    blindAmount: "",
    chipValues: {},
    chipCounts: {}
  };
  for (const chip of CHIP_CONFIG) {
    draft.chipValues[chip.key] = "";
    draft.chipCounts[chip.key] = "0";
  }
  return draft;
}

function normalizeDraft(draft, fallbackPlayerName = "") {
  const out = createDefaultDraft(fallbackPlayerName);
  if (!draft || typeof draft !== "object") return out;

  const playerName = String(draft.playerName || fallbackPlayerName || "").trim();
  out.playerName = playerName;
  out.blindAmount = sanitizeNumericDraftValue(draft.blindAmount, { integer: false, fallback: "" });

  for (const chip of CHIP_CONFIG) {
    out.chipValues[chip.key] = sanitizeNumericDraftValue(draft?.chipValues?.[chip.key], {
      integer: false,
      fallback: ""
    });
    out.chipCounts[chip.key] = sanitizeNumericDraftValue(draft?.chipCounts?.[chip.key], {
      integer: true,
      fallback: "0"
    });
  }

  return out;
}

function buildDraftFromCurrentInputs() {
  const selectedPlayer = getSelectedOngoingPlayer();
  const draft = createDefaultDraft(selectedPlayer?.playerName || "");

  draft.playerName = String(els.playerNameInput?.value || selectedPlayer?.playerName || "").trim();
  draft.blindAmount = String(els.blindAmountInput?.value || "").trim();

  for (const chip of chipRefs) {
    draft.chipValues[chip.key] = String(chip.valueInput?.value || "").trim();
    draft.chipCounts[chip.key] = String(chip.countInput?.value || "0").trim();
  }

  return normalizeDraft(draft, selectedPlayer?.playerName || "");
}

function buildDraftFromSavedPlayer(player) {
  const base = createDefaultDraft(player?.playerName || "");
  if (!player) return base;

  if (player.savedBlindAmount != null && Number(player.savedBlindAmount) > 0) {
    base.blindAmount = String(Number(player.savedBlindAmount));
  }

  const savedValues = sanitizeChipObject(player.savedChipValues) || {};
  const savedCounts = sanitizeChipObject(player.savedChipCounts, { integer: true }) || {};

  for (const chip of CHIP_CONFIG) {
    if (savedValues[chip.key] != null) {
      base.chipValues[chip.key] = String(savedValues[chip.key]);
    }
    if (savedCounts[chip.key] != null) {
      base.chipCounts[chip.key] = String(savedCounts[chip.key]);
    }
  }

  return normalizeDraft(base, player.playerName || "");
}

function readDraftFromStorage(sessionId, playerId, fallbackPlayerName = "") {
  if (!sessionId || !playerId) return null;
  const map = readDraftStorageMap();
  const key = buildStorageCompositeKey(sessionId, playerId);
  if (!(key in map)) return null;
  return normalizeDraft(map[key], fallbackPlayerName);
}

function writeDraftToStorage(sessionId, playerId, draft, fallbackPlayerName = "") {
  if (!sessionId || !playerId) return;
  const map = readDraftStorageMap();
  const key = buildStorageCompositeKey(sessionId, playerId);
  map[key] = normalizeDraft(draft, fallbackPlayerName);
  writeDraftStorageMap(map);
}

function getSelectedOngoingPlayer() {
  const id = String(state.selectedOngoingPlayerId || "").trim();
  if (!id) return null;
  return state.ongoingPlayers.find((p) => p.playerId === id) || null;
}

function getPlayerById(playerId) {
  const pid = String(playerId || "").trim();
  if (!pid) return null;
  return state.ongoingPlayers.find((p) => p.playerId === pid) || null;
}

function storeDraftForPlayer(playerId, draft) {
  const session = state.ongoingSession;
  const player = getPlayerById(playerId);
  if (!session || !player) return;
  const normalized = normalizeDraft(draft, player.playerName || "");
  state.draftByPlayerId.set(player.playerId, normalized);
  writeDraftToStorage(session.id, player.playerId, normalized, player.playerName || "");
}

function storeCurrentDraftForSelectedPlayer() {
  const selected = getSelectedOngoingPlayer();
  if (!selected) return;
  storeDraftForPlayer(selected.playerId, buildDraftFromCurrentInputs());
}

function getDraftForPlayer(player) {
  if (!player) return createDefaultDraft("");
  const session = state.ongoingSession;
  if (!session) return createDefaultDraft(player.playerName || "");

  const inMemory = state.draftByPlayerId.get(player.playerId);
  if (inMemory) return normalizeDraft(inMemory, player.playerName || "");

  const fromStorage = readDraftFromStorage(session.id, player.playerId, player.playerName || "");
  if (fromStorage) {
    state.draftByPlayerId.set(player.playerId, fromStorage);
    return fromStorage;
  }

  const fromSaved = buildDraftFromSavedPlayer(player);
  state.draftByPlayerId.set(player.playerId, fromSaved);
  writeDraftToStorage(session.id, player.playerId, fromSaved, player.playerName || "");
  return fromSaved;
}

function applyDraftToInputs(draft, { forcePlayerName = "" } = {}) {
  const normalized = normalizeDraft(draft, forcePlayerName || "");

  for (const chip of chipRefs) {
    if (chip.valueInput instanceof HTMLInputElement) {
      chip.valueInput.value = normalized.chipValues[chip.key] || "";
      chip.valueInput.placeholder = String(chip.defaultValue);
    }
    if (chip.countInput instanceof HTMLInputElement) {
      chip.countInput.value = normalized.chipCounts[chip.key] || "0";
    }
  }

  if (els.blindAmountInput instanceof HTMLInputElement) {
    els.blindAmountInput.value = normalized.blindAmount || "";
  }

  if (els.playerNameInput instanceof HTMLInputElement) {
    els.playerNameInput.value = String(forcePlayerName || normalized.playerName || "").trim();
  }
}

function applySelectedPlayerDraft() {
  const selected = getSelectedOngoingPlayer();
  if (!selected) {
    applyDefaults();
    if (els.playerNameInput instanceof HTMLInputElement) {
      els.playerNameInput.value = "";
    }
    return;
  }

  const draft = getDraftForPlayer(selected);
  applyDraftToInputs(draft, { forcePlayerName: selected.playerName });
}

function applyDefaults() {
  for (const chip of chipRefs) {
    if (chip.valueInput instanceof HTMLInputElement) {
      chip.valueInput.value = "";
      chip.valueInput.placeholder = String(chip.defaultValue);
    }
    if (chip.countInput instanceof HTMLInputElement) {
      chip.countInput.value = "0";
    }
    if (chip.subtotalCell) {
      chip.subtotalCell.textContent = "0";
    }
  }
  if (els.blindAmountInput instanceof HTMLInputElement) {
    els.blindAmountInput.value = "";
  }
}

function readChipPayloadFromInputs() {
  const chipValues = {};
  const chipCounts = {};

  for (const chip of chipRefs) {
    chipValues[chip.key] = readNonNegativeNumberWithDefault(chip.valueInput, chip.defaultValue);
    chipCounts[chip.key] = readNonNegativeNumber(chip.countInput, { integer: true });
  }

  return {
    chipValues,
    chipCounts
  };
}

function updateOngoingPlayerReminder() {
  if (!els.ongoingPlayerReminder) return;

  const session = state.ongoingSession;
  if (!session) {
    els.ongoingPlayerReminder.textContent = "Aucune session active détectée.";
    return;
  }

  const player = getSelectedOngoingPlayer();
  if (!player) {
    els.ongoingPlayerReminder.textContent = `Session ${session.name}: sélectionne un joueur pour afficher son rappel de stack.`;
    return;
  }

  const chunks = [];
  chunks.push(`${player.playerName}`);
  chunks.push(`Mises: ${formatNumber(player.buyinAmount, 0)} €`);
  chunks.push(`Stack de rappel: ${formatNumber(player.referenceStack, 0)} (10 € = ${formatNumber(session.stackPer10, 0)})`);

  if (player.savedCurrentStack != null) {
    chunks.push(`Stack live: ${formatNumber(player.savedCurrentStack, 0)}`);
  } else {
    chunks.push("Aucun stack live sauvegardé");
  }

  if (player.savedBlindAmount != null && Number(player.savedBlindAmount) > 0) {
    chunks.push(`Blinde live: ${formatNumber(player.savedBlindAmount, 0)}`);
  }

  if (player.savedBlindsRemainingExact != null) {
    chunks.push(`Blindes live: ${formatTrimmed(player.savedBlindsRemainingExact, 2)}`);
  }

  if (player.savedUpdatedAt) {
    chunks.push(`Maj: ${String(player.savedUpdatedAt)}`);
  }

  els.ongoingPlayerReminder.textContent = chunks.join(" | ");
}

function updateCalculations() {
  const pieces = [];
  let totalStack = 0;

  for (const chip of chipRefs) {
    const chipValue = readNonNegativeNumberWithDefault(chip.valueInput, chip.defaultValue);
    const chipCount = readNonNegativeNumber(chip.countInput, { integer: true });
    const subtotal = chipValue * chipCount;
    totalStack += subtotal;

    if (chip.subtotalCell) {
      chip.subtotalCell.textContent = formatNumber(subtotal, 0);
    }
    if (chipCount > 0 && chipValue > 0) {
      pieces.push(`${chipCount} × ${formatNumber(chipValue, 0)} (${chip.label})`);
    }
  }

  const blind = readNonNegativeNumber(els.blindAmountInput);
  const blindsExact = blind > 0 ? (totalStack / blind) : null;
  const blindsFull = blindsExact == null ? null : Math.floor(blindsExact);

  const selectedPlayer = getSelectedOngoingPlayer();
  const playerName = String(selectedPlayer?.playerName || els.playerNameInput?.value || "").trim();
  const playerPrefix = playerName ? `${playerName} : ` : "";

  if (els.stackTotalCell) {
    els.stackTotalCell.textContent = formatNumber(totalStack, 0);
  }
  if (els.stackTotalValue) {
    els.stackTotalValue.textContent = formatNumber(totalStack, 0);
  }
  if (els.blindsExactValue) {
    els.blindsExactValue.textContent = blindsExact == null ? "-" : formatTrimmed(blindsExact, 2);
  }
  if (els.blindsFullValue) {
    els.blindsFullValue.textContent = blindsFull == null ? "-" : formatNumber(blindsFull, 0);
  }

  if (els.formulaLine) {
    if (!pieces.length) {
      els.formulaLine.textContent = `${playerPrefix}Saisis les jetons du joueur pour calculer son stack actuel.`;
    } else {
      const baseFormula = `${pieces.join(" + ")} = ${formatNumber(totalStack, 0)}`;
      if (blind <= 0) {
        els.formulaLine.textContent = `${playerPrefix}${baseFormula} | Saisis la blinde pour calculer les blindes restantes.`;
      } else {
        els.formulaLine.textContent = `${playerPrefix}${baseFormula} | ${formatNumber(totalStack, 0)} / ${formatNumber(blind, 0)} = ${formatTrimmed(blindsExact, 2)} blindes`;
      }
    }
  }

  return {
    totalStack,
    blind,
    blindsExact,
    blindsFull,
    playerName
  };
}

function updatePlayerSavedState(playerId, payload) {
  const player = getPlayerById(playerId);
  if (!player) return;

  player.savedCurrentStack = payload.current_stack;
  player.savedBlindAmount = payload.blind_amount;
  player.savedBlindsRemainingExact = payload.blinds_remaining_exact;
  player.savedChipValues = sanitizeChipObject(payload.chip_values_json) || null;
  player.savedChipCounts = sanitizeChipObject(payload.chip_counts_json, { integer: true }) || null;
  player.savedUpdatedAt = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getSavePayloadFromCurrentUI() {
  const session = state.ongoingSession;
  const player = getSelectedOngoingPlayer();
  if (!session || !player) return null;

  const calc = updateCalculations();
  const chips = readChipPayloadFromInputs();

  const blindAmount = calc.blind > 0 ? calc.blind : null;
  const blindsRemainingExact = calc.blindsExact == null
    ? null
    : Number(calc.blindsExact.toFixed(6));

  return {
    session_id: Number(session.id),
    player_id: Number(player.playerId),
    current_stack: Number(calc.totalStack.toFixed(4)),
    blind_amount: blindAmount == null ? null : Number(blindAmount.toFixed(4)),
    blinds_remaining_exact: blindsRemainingExact,
    chip_values_json: chips.chipValues,
    chip_counts_json: chips.chipCounts
  };
}

async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const savedKey = String(sessionStorage.getItem(ADMIN_KEY_STORAGE) || "").trim();
    const enteredKey = String(headers["x-admin-key"] || savedKey || ADMIN_DEFAULT_KEY || "").trim();
    if (!enteredKey) {
      throw new Error("Clé admin requise pour sauvegarder");
    }
    sessionStorage.setItem(ADMIN_KEY_STORAGE, enteredKey);
    headers["x-admin-key"] = enteredKey;

    const savedCode = String(sessionStorage.getItem(ADMIN_CODE_STORAGE) || "").trim();
    const enteredCode = String(
      headers["x-admin-code"] ||
      savedCode ||
      window.prompt("Entrez le code admin de confirmation :") ||
      ""
    ).trim();
    if (!enteredCode) {
      throw new Error("Code admin requis pour sauvegarder");
    }
    sessionStorage.setItem(ADMIN_CODE_STORAGE, enteredCode);
    headers["x-admin-code"] = enteredCode;
  }

  let lastNetworkError = null;
  let lastApiError = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers,
        ...options
      });
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = body?.detail || body?.message || "";
        } catch {
          // ignore parse errors
        }
        if (res.status === 401 || res.status === 403) {
          sessionStorage.removeItem(ADMIN_KEY_STORAGE);
          sessionStorage.removeItem(ADMIN_CODE_STORAGE);
        }
        lastApiError = lastApiError || new Error(`API ${res.status}${detail ? `: ${detail}` : ""}`);
        continue;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (err) {
      lastNetworkError = err;
    }
  }

  throw lastApiError || lastNetworkError || new Error("API unreachable");
}

async function saveLiveStackPayload(payload, { manual = false } = {}) {
  if (!payload) {
    if (manual) setValidationStatus("Impossible de sauvegarder: joueur de session active non sélectionné.");
    return { saved: false, reason: "missing-payload" };
  }

  const playerKey = String(payload.player_id || "").trim();
  if (!playerKey) {
    if (manual) setValidationStatus("Impossible de sauvegarder: joueur de session active non sélectionné.");
    return { saved: false, reason: "missing-player" };
  }

  const signature = buildPayloadSignature(payload);
  const lastSignature = state.lastSavedSignatureByPlayerId.get(playerKey);
  if (!manual && signature && signature === lastSignature) {
    return { saved: false, reason: "unchanged" };
  }

  await apiFetch("/api/live-stacks", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.lastSavedSignatureByPlayerId.set(playerKey, signature);
  state.liveStacksByPlayerId.set(playerKey, {
    current_stack: payload.current_stack,
    blind_amount: payload.blind_amount,
    blinds_remaining_exact: payload.blinds_remaining_exact,
    chip_values_json: sanitizeChipObject(payload.chip_values_json) || null,
    chip_counts_json: sanitizeChipObject(payload.chip_counts_json, { integer: true }) || null
  });
  updatePlayerSavedState(playerKey, payload);

  const selected = getSelectedOngoingPlayer();
  if (selected && selected.playerId === playerKey) {
    updateOngoingPlayerReminder();
  }

  if (manual) {
    const targetPlayer = getPlayerById(playerKey);
    const reference = Number(targetPlayer?.referenceStack || 0);
    const delta = payload.current_stack - reference;
    const deltaSign = delta > 0 ? "+" : "";
    setValidationStatus(
      `Sauvegardé pour ${targetPlayer?.playerName || playerKey}: ${formatNumber(payload.current_stack, 0)} | Écart vs rappel session: ${deltaSign}${formatNumber(delta, 0)}`
    );
  }

  return { saved: true, payload };
}

function clearPendingAutoSave() {
  if (state.autoSaveTimer) {
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }
}

async function flushPendingAutoSave() {
  const pending = state.pendingAutoSavePayload;
  clearPendingAutoSave();
  state.pendingAutoSavePayload = null;
  if (!pending) return;

  try {
    await saveLiveStackPayload(pending, { manual: false });
  } catch (err) {
    setValidationStatus(`Sauvegarde auto impossible (${String(err?.message || "erreur")})`);
  }
}

function scheduleAutoSave() {
  const payload = getSavePayloadFromCurrentUI();
  if (!payload) {
    clearPendingAutoSave();
    state.pendingAutoSavePayload = null;
    return;
  }

  const playerKey = String(payload.player_id || "").trim();
  const signature = buildPayloadSignature(payload);
  const lastSignature = state.lastSavedSignatureByPlayerId.get(playerKey);
  if (signature && signature === lastSignature) {
    clearPendingAutoSave();
    state.pendingAutoSavePayload = null;
    return;
  }

  clearPendingAutoSave();
  state.pendingAutoSavePayload = payload;
  state.autoSaveTimer = window.setTimeout(() => {
    const current = state.pendingAutoSavePayload;
    state.pendingAutoSavePayload = null;
    state.autoSaveTimer = null;
    if (!current) return;

    saveLiveStackPayload(current, { manual: false }).catch((err) => {
      setValidationStatus(`Sauvegarde auto impossible (${String(err?.message || "erreur")})`);
    });
  }, 700);
}

function updateOngoingPlayerOptions() {
  if (!(els.ongoingPlayerSelect instanceof HTMLSelectElement)) return;

  if (!state.ongoingPlayers.length) {
    els.ongoingPlayerSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucun joueur";
    els.ongoingPlayerSelect.appendChild(option);
    els.ongoingPlayerSelect.value = "";
    state.selectedOngoingPlayerId = "";
    return;
  }

  els.ongoingPlayerSelect.innerHTML = "";
  for (const player of state.ongoingPlayers) {
    const option = document.createElement("option");
    option.value = String(player.playerId);
    option.textContent = String(player.playerName);
    els.ongoingPlayerSelect.appendChild(option);
  }

  if (state.selectedOngoingPlayerId && state.ongoingPlayers.some((p) => p.playerId === state.selectedOngoingPlayerId)) {
    els.ongoingPlayerSelect.value = state.selectedOngoingPlayerId;
  } else {
    state.selectedOngoingPlayerId = String(state.ongoingPlayers[0]?.playerId || "");
    els.ongoingPlayerSelect.value = state.selectedOngoingPlayerId || "";
  }
}

function pickTargetSession(sessions) {
  if (!sessions.length) return null;

  const preferred = String(state.preferredSessionId || "").trim();
  if (preferred) {
    const matchingPreferred = sessions.find((s) => String(s.id) === preferred);
    if (matchingPreferred) return matchingPreferred;
  }

  const ongoing = sessions
    .filter((s) => s.isOngoing)
    .sort((a, b) => compareSessionIdsDesc(a.id, b.id));
  if (ongoing.length) return ongoing[0];

  return [...sessions].sort((a, b) => compareSessionIdsDesc(a.id, b.id))[0] || null;
}

function parseLiveStackRow(row) {
  const chipValues = sanitizeChipObject(row?.chip_values_json) || null;
  const chipCounts = sanitizeChipObject(row?.chip_counts_json, { integer: true }) || null;

  return {
    current_stack: row?.current_stack == null ? null : Number(row.current_stack),
    blind_amount: row?.blind_amount == null ? null : Number(row.blind_amount),
    blinds_remaining_exact: row?.blinds_remaining_exact == null ? null : Number(row.blinds_remaining_exact),
    chip_values_json: chipValues,
    chip_counts_json: chipCounts,
    updated_at: row?.updated_at ? String(row.updated_at) : ""
  };
}

async function loadOngoingSessionReminder() {
  if (els.ongoingSessionInfo) {
    els.ongoingSessionInfo.textContent = "Chargement de la session active...";
  }

  try {
    const [players, sessions, entries, buyins, payouts] = await Promise.all([
      apiFetch("/api/players"),
      apiFetch("/api/sessions"),
      apiFetch("/api/entries"),
      apiFetch("/api/buyins"),
      apiFetch("/api/payouts")
    ]);

    const playerNameById = Object.fromEntries(
      (players || []).map((p) => [String(p.player_id), String(p.player_name || "").trim()])
    );

    const buyinTotalsBySession = new Map();
    const buyinTotalsBySessionPlayer = new Map();
    for (const b of (buyins || [])) {
      const sid = String(b.session_id);
      const pid = String(b.player_id);
      const key = `${sid}|${pid}`;
      const amount = Number(b.amount || 0);
      buyinTotalsBySession.set(sid, (buyinTotalsBySession.get(sid) || 0) + amount);
      buyinTotalsBySessionPlayer.set(key, (buyinTotalsBySessionPlayer.get(key) || 0) + amount);
    }

    const payoutTotalsBySession = new Map();
    for (const p of (payouts || [])) {
      const sid = String(p.session_id);
      payoutTotalsBySession.set(sid, (payoutTotalsBySession.get(sid) || 0) + Number(p.amount || 0));
    }

    const sessionsNormalized = (sessions || [])
      .map((s) => {
        const sid = String(s.session_id);
        const buyinTotal = Number(buyinTotalsBySession.get(sid) || 0);
        const payoutTotal = Number(payoutTotalsBySession.get(sid) || 0);
        const isClosed = Number(s.is_closed || 0) === 1;
        const hasAssignedGains = payoutTotal > 0;
        const payoutsBalanced = Math.abs(payoutTotal - buyinTotal) < 0.01;
        const isOngoing = !isClosed || !hasAssignedGains || !payoutsBalanced;
        const stackPer10Raw = Number(s.stack_per_10_eur);
        return {
          id: sid,
          name: String(s.session_name || `Session ${sid}`),
          stackPer10: Number.isFinite(stackPer10Raw) && stackPer10Raw > 0 ? Math.floor(stackPer10Raw) : DEFAULT_STACK_PER_10,
          isOngoing
        };
      })
      .sort((a, b) => compareSessionIdsDesc(a.id, b.id));

    const session = pickTargetSession(sessionsNormalized);
    if (!session) {
      state.ongoingSession = null;
      state.ongoingPlayers = [];
      state.selectedOngoingPlayerId = "";
      state.liveStacksByPlayerId = new Map();
      state.lastSavedSignatureByPlayerId = new Map();
      state.draftByPlayerId = new Map();
      updateOngoingPlayerOptions();
      applyDefaults();
      if (els.playerNameInput instanceof HTMLInputElement) {
        els.playerNameInput.value = "";
      }
      if (els.ongoingSessionInfo) {
        els.ongoingSessionInfo.textContent = "Aucune session détectée.";
      }
      updateOngoingPlayerReminder();
      updateCalculations();
      return;
    }

    state.ongoingSession = session;
    if (els.ongoingSessionInfo) {
      const status = session.isOngoing ? "en cours" : "non marquée en cours";
      els.ongoingSessionInfo.textContent = `Session active: ${session.name} (${status}) | Référence stack: 10 € = ${formatNumber(session.stackPer10, 0)}`;
    }

    const liveStacksRows = await apiFetch(`/api/live-stacks?session_id=${encodeURIComponent(session.id)}`);
    const liveByPlayerId = new Map(
      (liveStacksRows || []).map((row) => [String(row.player_id), parseLiveStackRow(row)])
    );
    state.liveStacksByPlayerId = liveByPlayerId;
    state.lastSavedSignatureByPlayerId = new Map(
      [...liveByPlayerId.entries()].map(([pid, value]) => [
        pid,
        buildPayloadSignature({
          session_id: Number(session.id),
          player_id: Number(pid),
          current_stack: value.current_stack,
          blind_amount: value.blind_amount,
          blinds_remaining_exact: value.blinds_remaining_exact,
          chip_values_json: value.chip_values_json,
          chip_counts_json: value.chip_counts_json
        })
      ])
    );

    const playersInSession = (entries || [])
      .filter((e) => String(e.session_id) === session.id)
      .map((e) => {
        const pid = String(e.player_id);
        const playerName = String(e.player_name || playerNameById[pid] || pid);
        const buyinAmount = Number(buyinTotalsBySessionPlayer.get(`${session.id}|${pid}`) || 0);
        const referenceStack = Math.round((buyinAmount / 10) * session.stackPer10);
        const live = liveByPlayerId.get(pid) || {};
        return {
          playerId: pid,
          playerName,
          buyinAmount,
          referenceStack,
          savedCurrentStack: live.current_stack ?? null,
          savedBlindAmount: live.blind_amount ?? null,
          savedBlindsRemainingExact: live.blinds_remaining_exact ?? null,
          savedChipValues: live.chip_values_json ?? null,
          savedChipCounts: live.chip_counts_json ?? null,
          savedUpdatedAt: live.updated_at ? String(live.updated_at) : ""
        };
      })
      .sort((a, b) => a.playerName.localeCompare(b.playerName, "fr", { sensitivity: "base" }));

    state.ongoingPlayers = playersInSession;
    state.draftByPlayerId = new Map();

    updateOngoingPlayerOptions();
    applySelectedPlayerDraft();
    updateOngoingPlayerReminder();
    updateCalculations();
  } catch (err) {
    state.ongoingSession = null;
    state.ongoingPlayers = [];
    state.selectedOngoingPlayerId = "";
    state.liveStacksByPlayerId = new Map();
    state.lastSavedSignatureByPlayerId = new Map();
    state.draftByPlayerId = new Map();
    updateOngoingPlayerOptions();
    applyDefaults();
    if (els.playerNameInput instanceof HTMLInputElement) {
      els.playerNameInput.value = "";
    }
    if (els.ongoingSessionInfo) {
      els.ongoingSessionInfo.textContent = `Impossible de charger la session active (${String(err?.message || "erreur API")}).`;
    }
    updateOngoingPlayerReminder();
    updateCalculations();
  }
}

function bindEvents() {
  for (const chip of chipRefs) {
    chip.valueInput?.addEventListener("input", () => {
      storeCurrentDraftForSelectedPlayer();
      updateCalculations();
      scheduleAutoSave();
    });
    chip.countInput?.addEventListener("input", () => {
      storeCurrentDraftForSelectedPlayer();
      updateCalculations();
      scheduleAutoSave();
    });
  }

  els.blindAmountInput?.addEventListener("input", () => {
    storeCurrentDraftForSelectedPlayer();
    updateCalculations();
    scheduleAutoSave();
  });

  els.ongoingPlayerSelect?.addEventListener("change", () => {
    if (!(els.ongoingPlayerSelect instanceof HTMLSelectElement)) return;

    const nextPlayerId = String(els.ongoingPlayerSelect.value || "").trim();
    const previousPlayerId = String(state.selectedOngoingPlayerId || "").trim();

    (async () => {
      if (previousPlayerId) {
        storeCurrentDraftForSelectedPlayer();
      }
      await flushPendingAutoSave();

      state.selectedOngoingPlayerId = nextPlayerId;
      applySelectedPlayerDraft();
      updateOngoingPlayerReminder();
      updateCalculations();
      setValidationStatus("Modification en temps réel active.");
    })().catch((err) => {
      setValidationStatus(`Changement de joueur incomplet (${String(err?.message || "erreur")})`);
    });
  });

  els.validateBtn?.addEventListener("click", () => {
    (async () => {
      try {
        storeCurrentDraftForSelectedPlayer();
        await flushPendingAutoSave();
        const payload = getSavePayloadFromCurrentUI();
        await saveLiveStackPayload(payload, { manual: true });
      } catch (err) {
        setValidationStatus(`Sauvegarde impossible (${String(err?.message || "erreur")})`);
      }
    })();
  });

  els.resetBtn?.addEventListener("click", () => {
    applyDefaults();
    const selected = getSelectedOngoingPlayer();
    if (els.playerNameInput instanceof HTMLInputElement) {
      els.playerNameInput.value = String(selected?.playerName || "");
    }
    storeCurrentDraftForSelectedPlayer();
    setValidationStatus("Calculateur réinitialisé pour ce joueur.");
    updateCalculations();
    scheduleAutoSave();
  });

  window.addEventListener("beforeunload", () => {
    storeCurrentDraftForSelectedPlayer();
  });
}

applyDefaults();
bindEvents();
setValidationStatus("Modification en temps réel active.");
updateCalculations();
loadOngoingSessionReminder().then(() => {
  updateCalculations();
});
