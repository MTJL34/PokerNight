const API_BASES = window.location.origin?.startsWith("http")
  ? ["", "http://localhost:8000"]
  : ["http://localhost:8000"];
const ADMIN_KEY_STORAGE = "poker_admin_key";

async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers["x-admin-key"]) {
    const saved = String(sessionStorage.getItem(ADMIN_KEY_STORAGE) || "").trim();
    const entered = saved || String(window.prompt("Entrez la clé admin :") || "").trim();
    if (!entered) throw new Error("Admin key required");
    sessionStorage.setItem(ADMIN_KEY_STORAGE, entered);
    headers["x-admin-key"] = entered;
  }

  let lastError = null;
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
        }
        lastError = new Error(`API ${res.status}${detail ? `: ${detail}` : ""}`);
        continue;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("API unreachable");
}

const refs = {
  sessionId: document.getElementById("sessionId"),
  sessionName: document.getElementById("sessionName"),
  stackPer10Input: document.getElementById("stackPer10Input"),
  chipValueInputs: {
    orange: document.getElementById("chipValueOrangeInput"),
    black: document.getElementById("chipValueBlackInput"),
    green: document.getElementById("chipValueGreenInput"),
    yellow: document.getElementById("chipValueYellowInput"),
    red: document.getElementById("chipValueRedInput"),
    white: document.getElementById("chipValueWhiteInput")
  },
  sessionStatusInput: document.getElementById("sessionStatusInput"),
  participantCount: document.getElementById("participantCount"),
  applyCountBtn: document.getElementById("applyCountBtn"),
  addRowBtn: document.getElementById("addRowBtn"),
  openNewParticipantBtn: document.getElementById("openNewParticipantBtn"),
  openGainsModalBtn: document.getElementById("openGainsModalBtn"),
  saveBtn: document.getElementById("saveBtn"),
  tbody: document.querySelector("#participantsTable tbody"),
  sessionTotalsInfo: document.getElementById("sessionTotalsInfo"),
  modal: document.getElementById("newParticipantModal"),
  newParticipantInput: document.getElementById("newParticipantInput"),
  cancelNewParticipantBtn: document.getElementById("cancelNewParticipantBtn"),
  confirmNewParticipantBtn: document.getElementById("confirmNewParticipantBtn"),
  gainsModal: document.getElementById("gainsModal"),
  gainFirstInput: document.getElementById("gainFirstInput"),
  gainSecondInput: document.getElementById("gainSecondInput"),
  gainThirdInput: document.getElementById("gainThirdInput"),
  gainsPoolInfo: document.getElementById("gainsPoolInfo"),
  gainsDistributedInfo: document.getElementById("gainsDistributedInfo"),
  cancelGainsModalBtn: document.getElementById("cancelGainsModalBtn"),
  confirmGainsModalBtn: document.getElementById("confirmGainsModalBtn")
};

let players = [];
let positions = [];
let sessionsData = { session: [] };
let playersData = { session: [] };
let gainsSplit = null;
let eliminationOrderCounter = 0;
const editSessionId = new URLSearchParams(window.location.search).get("editSessionId");
const BUYIN_UNIT_EUR = 10;
const MAX_BUYINS_PER_PLAYER = 3;
const CHIP_COLORS = ["orange", "black", "green", "yellow", "red", "white"];
const CHIP_COLOR_LABELS = {
  orange: "orange",
  black: "noir",
  green: "vert",
  yellow: "jaune",
  red: "rouge",
  white: "blanc"
};

function updateGainsButtonLabel() {
  const base = "Repartir les gains";
  if (!refs.openGainsModalBtn) return;
  const isClosed = String(refs.sessionStatusInput?.value || "open") === "closed";
  refs.openGainsModalBtn.disabled = !isClosed;
  if (!isClosed) {
    refs.openGainsModalBtn.textContent = `${base} (session ouverte)`;
    return;
  }
  if (!gainsSplit) {
    refs.openGainsModalBtn.textContent = base;
    return;
  }
  const total = Number(gainsSplit.first || 0) + Number(gainsSplit.second || 0) + Number(gainsSplit.third || 0);
  refs.openGainsModalBtn.textContent = `${base} (Total: ${total})`;
}

function parseMoney(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseChipValuesFromInputs() {
  const out = {};
  for (const color of CHIP_COLORS) {
    const input = refs.chipValueInputs?.[color];
    const rawValue = String(input?.value || "").trim();
    if (!rawValue) {
      out[color] = null;
      continue;
    }
    const value = parseMoney(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`La valeur du jeton ${CHIP_COLOR_LABELS[color]} doit etre un nombre positif.`);
    }
    out[color] = value;
  }
  return out;
}

function normalizeApiChipValue(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getChipValuesFromApiSession(session = {}) {
  const legacyValue = normalizeApiChipValue(session.chip_value);
  return {
    orange: normalizeApiChipValue(session.chip_value_orange) ?? legacyValue,
    black: normalizeApiChipValue(session.chip_value_black) ?? legacyValue,
    green: normalizeApiChipValue(session.chip_value_green) ?? legacyValue,
    yellow: normalizeApiChipValue(session.chip_value_yellow) ?? legacyValue,
    red: normalizeApiChipValue(session.chip_value_red) ?? legacyValue,
    white: normalizeApiChipValue(session.chip_value_white) ?? legacyValue
  };
}

function setChipValuesInInputs(chipValues = {}) {
  for (const color of CHIP_COLORS) {
    const input = refs.chipValueInputs?.[color];
    if (!(input instanceof HTMLInputElement)) continue;
    const value = chipValues[color];
    input.value = value == null ? "" : String(value);
  }
}

function normalizeMiseAmount(value) {
  const rounded = Math.round(parseMoney(value) / BUYIN_UNIT_EUR) * BUYIN_UNIT_EUR;
  const clamped = Math.max(0, Math.min(MAX_BUYINS_PER_PLAYER * BUYIN_UNIT_EUR, rounded));
  return clamped;
}

function sanitizeMiseInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  input.value = String(normalizeMiseAmount(input.value));
}

function getSelectedMisesTotal() {
  let total = 0;
  for (const row of refs.tbody.querySelectorAll("tr")) {
    total += normalizeMiseAmount(row.querySelector(".p-mise")?.value || 0);
  }
  return total;
}

function updateGainsPoolInfo() {
  if (!refs.gainsPoolInfo) return;
  const total = getSelectedMisesTotal();
  refs.gainsPoolInfo.textContent = `Il y a ${total} €`;
  updateSessionTotalsInfo();
}

function getDistributedGainsTotalFromRows() {
  let total = 0;
  for (const row of refs.tbody.querySelectorAll("tr")) {
    total += Number(row.dataset.gain || 0);
  }
  return total;
}

function getDistributedGainsTotalFromPopup() {
  let total = 0;
  total += Number(refs.gainFirstInput?.value || 0);
  total += Number(refs.gainSecondInput?.value || 0);
  total += Number(refs.gainThirdInput?.value || 0);
  return total;
}

function updateSessionTotalsInfo() {
  if (!refs.sessionTotalsInfo) return;
  const misesTotal = getSelectedMisesTotal();
  const gainsTotal = getDistributedGainsTotalFromRows();
  refs.sessionTotalsInfo.textContent = `Total mises: ${misesTotal} € | Total gains: ${gainsTotal} €`;
}

function updateDistributedInfo() {
  if (!refs.gainsDistributedInfo) return;
  const total = getDistributedGainsTotalFromPopup();
  refs.gainsDistributedInfo.textContent = `Total gains partages: ${total} €`;
}

function optionList(items, valueKey, labelKey) {
  return items
    .map((item) => `<option value="${String(item[valueKey])}">${String(item[labelKey])}</option>`)
    .join("");
}

function getUsedValues(className, exceptRow = null) {
  return new Set(
    [...refs.tbody.querySelectorAll(`tr`)]
      .filter((row) => row !== exceptRow)
      .map((row) => String(row.querySelector(`.${className}`)?.value || "").trim())
      .filter(Boolean)
  );
}

function selectFirstAvailable(select, usedSet) {
  if (!(select instanceof HTMLSelectElement)) return;
  const option = [...select.options].find((opt) => {
    const v = String(opt.value || "").trim();
    return v && !usedSet.has(v);
  });
  if (option) {
    select.value = String(option.value);
  }
}

function refreshPlayerSelects() {
  const html = optionList(players, "id", "name");
  for (const select of refs.tbody.querySelectorAll(".p-player")) {
    const current = String(select.value || "");
    select.innerHTML = html;
    if (players.some((p) => String(p.id) === current)) {
      select.value = current;
    }
  }
  enforceUniqueSelections();
}

function getPrefillMiseAmount(prefill = {}) {
  if (prefill.mise != null && prefill.mise !== "") return normalizeMiseAmount(prefill.mise);
  if (prefill.mise_amount != null && prefill.mise_amount !== "") return normalizeMiseAmount(prefill.mise_amount);
  if (prefill.mise_id != null && prefill.mise_id !== "") {
    return normalizeMiseAmount(Number(prefill.mise_id) * BUYIN_UNIT_EUR);
  }
  return BUYIN_UNIT_EUR;
}

function addRow(prefill = {}) {
  const prefillMise = getPrefillMiseAmount(prefill);
  const prefillGain = Number(prefill.gain ?? 0);
  const prefillEliminated = prefill.is_eliminated === true
    || prefill.is_eliminated === 1
    || prefill.is_eliminated === "1";

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><select class="p-player">${optionList(players, "id", "name")}</select></td>
    <td><select class="p-position">${optionList(positions, "id", "rang")}</select></td>
    <td><input class="p-mise" type="number" min="0" max="${MAX_BUYINS_PER_PLAYER * BUYIN_UNIT_EUR}" step="${BUYIN_UNIT_EUR}" value="${prefillMise}" /></td>
    <td style="text-align:center;"><input class="p-eliminated" type="checkbox" ${prefillEliminated ? "checked" : ""} /></td>
    <td class="p-gain-view">${prefillGain}</td>
    <td><button class="btn removeRow" type="button">Supprimer</button></td>
  `;
  tr.dataset.eliminated = prefillEliminated ? "1" : "0";
  refs.tbody.appendChild(tr);

  const playerSelect = tr.querySelector(".p-player");
  const positionSelect = tr.querySelector(".p-position");

  if (prefill.joueur_id) {
    playerSelect.value = String(prefill.joueur_id);
  } else {
    selectFirstAvailable(playerSelect, getUsedValues("p-player", tr));
  }
  if (prefill.position_id) {
    positionSelect.value = String(prefill.position_id);
  } else {
    selectFirstAvailable(positionSelect, getUsedValues("p-position", tr));
  }
  sanitizeMiseInput(tr.querySelector(".p-mise"));
  enforceUniqueSelections();
  sortRowsByPosition();
  recalculateDisplayedGains();
  updateGainsPoolInfo();
}

function setParticipantRows(count) {
  const n = Math.max(1, Number(count) || 1);
  eliminationOrderCounter = 0;
  refs.tbody.innerHTML = "";
  for (let i = 0; i < n; i += 1) addRow();
  enforceUniqueSelections();
  sortRowsByPosition();
  recalculateDisplayedGains();
  updateGainsPoolInfo();
}

function enforceUniqueForClass(className) {
  const selects = [...refs.tbody.querySelectorAll(`select.${className}`)];
  const selectedValues = selects
    .map((select) => String(select.value || "").trim())
    .filter(Boolean);

  for (const select of selects) {
    const own = String(select.value || "").trim();
    for (const option of select.options) {
      const val = String(option.value || "").trim();
      option.disabled = Boolean(val) && val !== own && selectedValues.includes(val);
    }
  }
}

function enforceUniqueSelections() {
  enforceUniqueForClass("p-player");
}

function parseAmount(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return NaN;
  return Number(normalized);
}

function normalizeGainValue(value, max) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(max, n));
  return Math.floor(clamped / 10) * 10;
}

function buildGainSelectOptions() {
  const max = Math.max(0, getSelectedMisesTotal());
  const selects = [refs.gainFirstInput, refs.gainSecondInput, refs.gainThirdInput];
  const prev = selects.map((s) => normalizeGainValue(s?.value, max));

  const options = [];
  for (let v = 0; v <= max; v += 10) {
    options.push(`<option value="${v}">${v}</option>`);
  }
  if (options.length === 0) options.push(`<option value="0">0</option>`);
  const html = options.join("");

  selects.forEach((select, idx) => {
    if (!(select instanceof HTMLSelectElement)) return;
    select.innerHTML = html;
    const desired = String(prev[idx]);
    select.value = [...select.options].some((o) => o.value === desired) ? desired : "0";
  });
}

function rankByPositionId(positionId) {
  const hit = positions.find((p) => String(p.id) === String(positionId));
  return hit ? Number(hit.rang) : null;
}

function getPositionIdByRank(rank) {
  const hit = positions.find((p) => Number(p.rang) === Number(rank));
  return hit ? String(hit.id) : null;
}

function getSortedPositionDefs() {
  return [...positions].sort((a, b) => Number(a.rang) - Number(b.rang));
}

function getRowEliminationOrder(row) {
  const n = Number(row?.dataset?.eliminationOrder || 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function setRowEliminationOrder(row, value) {
  if (!row) return;
  if (!Number.isInteger(value) || value <= 0) {
    delete row.dataset.eliminationOrder;
    return;
  }
  row.dataset.eliminationOrder = String(value);
}

function assignPositionsFromEliminationOrder() {
  const rows = [...refs.tbody.querySelectorAll("tr")];
  if (rows.length === 0) return;

  const rowCount = rows.length;
  for (const row of rows) {
    const eliminated = row.querySelector(".p-eliminated")?.checked === true;
    row.dataset.eliminated = eliminated ? "1" : "0";
    if (eliminated && !getRowEliminationOrder(row)) {
      eliminationOrderCounter += 1;
      setRowEliminationOrder(row, eliminationOrderCounter);
    }
    if (!eliminated) {
      setRowEliminationOrder(row, null);
    }
  }

  const eliminatedRows = rows
    .filter((row) => row.querySelector(".p-eliminated")?.checked)
    .sort((a, b) => (getRowEliminationOrder(a) || 0) - (getRowEliminationOrder(b) || 0));

  const desiredRankByRow = new Map();
  eliminatedRows.forEach((row, index) => {
    desiredRankByRow.set(row, rowCount - index);
  });

  const usedRanks = new Set();
  for (const row of eliminatedRows) {
    const rank = desiredRankByRow.get(row);
    const positionId = getPositionIdByRank(rank);
    const select = row.querySelector(".p-position");
    if (positionId && select instanceof HTMLSelectElement) {
      select.value = positionId;
      usedRanks.add(rank);
    }
  }

  const availableRanks = getSortedPositionDefs()
    .map((p) => Number(p.rang))
    .filter((rank) => rank >= 1 && rank <= rowCount)
    .filter((rank) => !usedRanks.has(rank));

  const nonEliminatedRows = rows.filter((row) => !desiredRankByRow.has(row));
  const rowsNeedingPosition = [];
  for (const row of nonEliminatedRows) {
    const select = row.querySelector(".p-position");
    const currentRank = rankByPositionId(String(select?.value || "").trim());
    if (currentRank != null && currentRank >= 1 && currentRank <= rowCount && !usedRanks.has(currentRank)) {
      usedRanks.add(currentRank);
      continue;
    }
    rowsNeedingPosition.push(row);
  }

  const remainingRanks = availableRanks.filter((rank) => !usedRanks.has(rank));
  rowsNeedingPosition.forEach((row, index) => {
    const rank = remainingRanks[index];
    const positionId = getPositionIdByRank(rank);
    const select = row.querySelector(".p-position");
    if (positionId && select instanceof HTMLSelectElement) {
      select.value = positionId;
      usedRanks.add(rank);
    }
  });

  enforceUniqueSelections();
  sortRowsByPosition();
  recalculateDisplayedGains();
}

function initializeEliminationOrderFromPositions() {
  const rows = [...refs.tbody.querySelectorAll("tr")];
  const eliminatedRows = rows
    .filter((row) => row.querySelector(".p-eliminated")?.checked)
    .sort((a, b) => {
      const ar = rankByPositionId(String(a.querySelector(".p-position")?.value || "").trim()) ?? -1;
      const br = rankByPositionId(String(b.querySelector(".p-position")?.value || "").trim()) ?? -1;
      return br - ar;
    });

  eliminatedRows.forEach((row, index) => {
    row.dataset.eliminated = "1";
    setRowEliminationOrder(row, index + 1);
  });
  rows
    .filter((row) => !row.querySelector(".p-eliminated")?.checked)
    .forEach((row) => {
      row.dataset.eliminated = "0";
      setRowEliminationOrder(row, null);
    });
  eliminationOrderCounter = eliminatedRows.length;
}

function applyPositionShift(changedSelect) {
  if (!(changedSelect instanceof HTMLSelectElement)) return;
  const changedRow = changedSelect.closest("tr");
  if (!changedRow) return;

  const targetId = String(changedSelect.value || "").trim();
  const targetRank = rankByPositionId(targetId);
  if (targetRank === null) return;

  const rows = [...refs.tbody.querySelectorAll("tr")];
  const sortedDefs = getSortedPositionDefs();
  if (rows.length === 0 || sortedDefs.length === 0) return;

  const currentRows = rows.filter((row) => row !== changedRow);
  const insertIndex = Math.max(0, Math.min(targetRank - 1, currentRows.length));
  currentRows.splice(insertIndex, 0, changedRow);

  currentRows.forEach((row, index) => {
    const def = sortedDefs[index];
    if (!def) return;
    const select = row.querySelector(".p-position");
    if (select instanceof HTMLSelectElement) {
      select.value = String(def.id);
    }
  });

  for (const row of currentRows) refs.tbody.appendChild(row);
}

function sortRowsByPosition() {
  const rows = [...refs.tbody.querySelectorAll("tr")];
  rows.sort((a, b) => {
    const aRank = rankByPositionId(String(a.querySelector(".p-position")?.value || "").trim());
    const bRank = rankByPositionId(String(b.querySelector(".p-position")?.value || "").trim());
    const av = aRank === null ? Number.POSITIVE_INFINITY : aRank;
    const bv = bRank === null ? Number.POSITIVE_INFINITY : bRank;
    return av - bv;
  });
  for (const row of rows) refs.tbody.appendChild(row);
}

function gainForRank(rank) {
  if (!gainsSplit) return 0;
  if (rank === 1) return gainsSplit.first;
  if (rank === 2) return gainsSplit.second;
  if (rank === 3) return gainsSplit.third;
  return 0;
}

function recalculateDisplayedGains() {
  const rows = [...refs.tbody.querySelectorAll("tr")];
  for (const tr of rows) {
    const positionId = String(tr.querySelector(".p-position")?.value || "").trim();
    const rank = rankByPositionId(positionId);
    const gain = gainForRank(rank);
    tr.dataset.gain = String(gain);
    const gainCell = tr.querySelector(".p-gain-view");
    if (gainCell) gainCell.textContent = String(gain);
  }
  updateSessionTotalsInfo();
}

function confirmGainsSplit() {
  const first = parseAmount(refs.gainFirstInput?.value);
  const second = parseAmount(refs.gainSecondInput?.value);
  const third = parseAmount(refs.gainThirdInput?.value);
  const sessionTotal = getSelectedMisesTotal();
  const splitTotal = Number(first || 0) + Number(second || 0) + Number(third || 0);

  if ([first, second, third].some((x) => Number.isNaN(x) || x < 0)) {
    throw new Error("Saisis des montants valides (0 ou plus) pour le top 3.");
  }
  if (splitTotal !== sessionTotal) {
    throw new Error(`Tous les gains doivent etre distribues: ${splitTotal} € / ${sessionTotal} €.`);
  }

  gainsSplit = { first, second, third };
  recalculateDisplayedGains();
  updateGainsButtonLabel();
  refs.gainsModal.style.display = "none";
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function tryWriteJsonFiles(sessionJson, playersJson) {
  if (!window.showDirectoryPicker) return false;
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });
  const dataDir = await dir.getDirectoryHandle("data", { create: false });

  const writeOne = async (name, content) => {
    const fh = await dataDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(content, null, 2));
    await w.close();
  };

  await writeOne("session.json", sessionJson);
  await writeOne("players.json", playersJson);
  return true;
}

function normalizeName(name) {
  return String(name || "").trim();
}

function findPlayerByName(list, name) {
  const needle = normalizeName(name).toLowerCase();
  if (!needle) return null;
  return list.find((p) => String(p.name || "").trim().toLowerCase() === needle) || null;
}

function nextPlayerId(list) {
  const maxId = Math.max(0, ...list.map((p) => Number(p.id) || 0));
  return String(maxId + 1);
}

async function addPlayerFromInput() {
  const name = normalizeName(refs.newParticipantInput?.value);
  if (!name) throw new Error("Saisis un nom.");

  const list = Array.isArray(playersData.session) ? playersData.session : [];
  const exists = findPlayerByName(list, name);
  if (!exists) {
    const playerId = nextPlayerId(list);
    await apiFetch("/api/players", {
      method: "POST",
      body: JSON.stringify({ player_id: Number(playerId), player_name: name })
    });
    list.push({ id: playerId, name });
  }

  list.sort((a, b) => Number(a.id) - Number(b.id));
  players = [...list];
  refreshPlayerSelects();

  refs.newParticipantInput.value = "";
  refs.modal.style.display = "none";
  alert(exists ? "Ce participant existe déjà." : "Participant ajouté.");
}

function buildNewSession() {
  const id = String(refs.sessionId.value || "").trim();
  const name = String(refs.sessionName.value || "").trim();
  const isClosed = String(refs.sessionStatusInput?.value || "open") === "closed";
  if (!id || !name) throw new Error("ID et nom de session obligatoires.");

  const rawStackPer10 = String(refs.stackPer10Input?.value || "").trim();
  const stackPer10 = rawStackPer10 ? Number(rawStackPer10) : null;
  if (rawStackPer10 && (!Number.isInteger(stackPer10) || stackPer10 <= 0)) {
    throw new Error("Le champ 10 € = stack doit etre un entier positif.");
  }

  const chipValues = parseChipValuesFromInputs();

  const rows = [...refs.tbody.querySelectorAll("tr")];
  if (rows.length === 0) throw new Error("Ajoute au moins un participant.");

  const participants = rows.map((tr) => {
    const joueurId = String(tr.querySelector(".p-player")?.value || "").trim();
    const positionId = String(tr.querySelector(".p-position")?.value || "").trim();
    const mise = normalizeMiseAmount(tr.querySelector(".p-mise")?.value || 0);
    const eliminated = tr.querySelector(".p-eliminated")?.checked ? 1 : 0;
    if (!joueurId) throw new Error("Chaque participant doit avoir un joueur.");
    if (!positionId) throw new Error("Chaque participant doit avoir une position.");
    if (mise % BUYIN_UNIT_EUR !== 0) {
      throw new Error(`Chaque mise doit etre un multiple de ${BUYIN_UNIT_EUR} €.`);
    }
    if (mise < 0 || mise > MAX_BUYINS_PER_PLAYER * BUYIN_UNIT_EUR) {
      throw new Error(`Chaque mise doit etre comprise entre 0 € et ${MAX_BUYINS_PER_PLAYER * BUYIN_UNIT_EUR} €.`);
    }

    return {
      joueur_id: joueurId,
      position_id: positionId,
      mise,
      is_eliminated: eliminated,
      gain: Number(tr.dataset.gain || 0)
    };
  });

  const playerSet = new Set(participants.map((p) => p.joueur_id));
  const positionSet = new Set(participants.map((p) => p.position_id));
  if (playerSet.size !== participants.length) {
    throw new Error("Un joueur ne peut apparaître qu'une seule fois dans la session.");
  }
  if (positionSet.size !== participants.length) {
    throw new Error("Une position ne peut être utilisée qu'une seule fois dans la session.");
  }

  return {
    id,
    name,
    is_closed: isClosed,
    stack_per_10_eur: stackPer10,
    chip_values: chipValues,
    participants
  };
}

function inferGainsSplitFromSession(session) {
  const out = { first: 0, second: 0, third: 0 };
  for (const p of (session?.participants || [])) {
    const rank = rankByPositionId(String(p.position_id || "").trim());
    const gain = Number(p.gain || 0);
    if (rank === 1) out.first = gain;
    if (rank === 2) out.second = gain;
    if (rank === 3) out.third = gain;
  }
  return out;
}

function buildStructuredSessionsFromApi(sessions, entries, buyins, payouts) {
  const sessionsById = new Map(
    (sessions || []).map((s) => [String(s.session_id), {
      id: String(s.session_id),
      name: String(s.session_name || ""),
      is_closed: Boolean(Number(s.is_closed || 0)),
      stack_per_10_eur: s.stack_per_10_eur == null ? null : Number(s.stack_per_10_eur),
      chip_values: getChipValuesFromApiSession(s),
      participants: []
    }])
  );

  const buyinTotals = new Map();
  for (const b of (buyins || [])) {
    const key = `${b.session_id}|${b.player_id}`;
    buyinTotals.set(key, (buyinTotals.get(key) || 0) + Number(b.amount || 0));
  }

  const payoutTotals = new Map();
  for (const p of (payouts || [])) {
    const key = `${p.session_id}|${p.player_id}`;
    payoutTotals.set(key, Number(p.amount || 0));
  }

  for (const e of (entries || [])) {
    const sid = String(e.session_id);
    const pid = String(e.player_id);
    const key = `${sid}|${pid}`;
    const session = sessionsById.get(sid);
    if (!session) continue;
    const mise = Number(buyinTotals.get(key) || 0);
    session.participants.push({
      joueur_id: pid,
      position_id: String(e.position_id || ""),
      mise,
      is_eliminated: Number(e.is_eliminated || 0) ? 1 : 0,
      gain: Number(payoutTotals.get(key) || 0)
    });
  }

  for (const session of sessionsById.values()) {
    if (!session.is_closed) {
      session.is_closed = session.participants.some((p) => Number(p.gain || 0) > 0);
    }
  }

  return [...sessionsById.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

function applyEditModeIfNeeded() {
  if (!editSessionId) return;
  const list = Array.isArray(sessionsData.session) ? sessionsData.session : [];
  const target = list.find((s) => String(s.id || "") === String(editSessionId));
  if (!target) {
    alert("Session a modifier introuvable.");
    return;
  }

  refs.sessionId.value = String(target.id || "");
  refs.sessionName.value = String(target.name || `Poker ${target.id || ""}`);
  refs.sessionStatusInput.value = target.is_closed ? "closed" : "open";
  refs.stackPer10Input.value = target.stack_per_10_eur == null ? "" : String(target.stack_per_10_eur);
  setChipValuesInInputs(target.chip_values || {});
  refs.participantCount.value = String(Math.max(1, (target.participants || []).length));
  refs.tbody.innerHTML = "";

  const participants = [...(target.participants || [])].sort((a, b) => {
    const ar = rankByPositionId(String(a.position_id || "").trim()) ?? 999;
    const br = rankByPositionId(String(b.position_id || "").trim()) ?? 999;
    return ar - br;
  });
  for (const p of participants) addRow(p);
  initializeEliminationOrderFromPositions();

  gainsSplit = target.is_closed ? inferGainsSplitFromSession(target) : null;
  recalculateDisplayedGains();
  updateGainsButtonLabel();
  updateGainsPoolInfo();
}

async function saveSessionJson() {
  const newSession = buildNewSession();
  const participants = newSession.is_closed
    ? [...newSession.participants]
    : newSession.participants.map((p) => ({ ...p, gain: 0 }));

  if (newSession.is_closed) {
    const totalMises = participants.reduce((acc, p) => acc + Number(p.mise || 0), 0);
    const totalGains = participants.reduce((acc, p) => acc + Number(p.gain || 0), 0);
    if (totalMises !== totalGains) {
      throw new Error(`Session fermee: tous les gains doivent etre distribues (${totalGains} € / ${totalMises} €).`);
    }
  }

  const existing = (sessionsData.session || []).some((s) => String(s.id) === String(newSession.id));

  if (existing) {
    await apiFetch(`/api/sessions/${encodeURIComponent(newSession.id)}`, { method: "DELETE" });
  }

  await apiFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      session_id: Number(newSession.id),
      session_name: newSession.name,
      is_closed: newSession.is_closed ? 1 : 0,
      stack_per_10_eur: newSession.stack_per_10_eur,
      chip_value_orange: newSession.chip_values.orange,
      chip_value_black: newSession.chip_values.black,
      chip_value_green: newSession.chip_values.green,
      chip_value_yellow: newSession.chip_values.yellow,
      chip_value_red: newSession.chip_values.red,
      chip_value_white: newSession.chip_values.white
    })
  });

  for (const p of participants) {
    await apiFetch("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        session_id: Number(newSession.id),
        player_id: Number(p.joueur_id),
        position_id: Number(p.position_id),
        is_eliminated: Number(p.is_eliminated || 0)
      })
    });

    const totalMise = Number(p.mise || 0);
    const buyinCount = Math.max(0, Math.min(MAX_BUYINS_PER_PLAYER, Math.floor(totalMise / BUYIN_UNIT_EUR)));
    for (let i = 0; i < buyinCount; i += 1) {
      await apiFetch("/api/buyins", {
        method: "POST",
        body: JSON.stringify({
          session_id: Number(newSession.id),
          player_id: Number(p.joueur_id)
        })
      });
    }

    if (newSession.is_closed && Number(p.gain || 0) > 0) {
      const rank = rankByPositionId(String(p.position_id));
      if (rank == null) continue;
      await apiFetch("/api/payouts", {
        method: "POST",
        body: JSON.stringify({
          session_id: Number(newSession.id),
          rank_no: Number(rank),
          player_id: Number(p.joueur_id),
          amount: Number(p.gain)
        })
      });
    }
  }
}

async function finalizeSessionAndGoHome() {
  await saveSessionJson();
  window.location.href = "./home.html";
}

async function loadData() {
  const [posRes, apiPlayers, apiSessions, apiEntries, apiBuyins, apiPayouts] = await Promise.all([
    fetch("./data/positions.json", { cache: "no-store" }),
    apiFetch("/api/players"),
    apiFetch("/api/sessions"),
    apiFetch("/api/entries"),
    apiFetch("/api/buyins"),
    apiFetch("/api/payouts")
  ]);

  const posJson = await posRes.json();

  players = (apiPlayers || []).map((p) => ({
    id: String(p.player_id),
    name: String(p.player_name || "").trim()
  }));
  playersData = { session: [...players] };
  positions = Array.isArray(posJson.session) ? posJson.session : [];
  sessionsData = {
    session: buildStructuredSessionsFromApi(apiSessions, apiEntries, apiBuyins, apiPayouts)
  };

  const maxSessionId = Math.max(0, ...sessionsData.session.map((s) => Number(s.id) || 0));
  if (editSessionId) {
    applyEditModeIfNeeded();
  } else {
    refs.sessionId.value = String(maxSessionId + 1);
    refs.sessionName.value = `Poker ${maxSessionId + 1}`;
    refs.sessionStatusInput.value = "open";
    refs.stackPer10Input.value = "";
    setChipValuesInInputs({});
    setParticipantRows(Number(refs.participantCount?.value || 8));
    updateGainsButtonLabel();
    updateGainsPoolInfo();
  }
}

refs.addRowBtn.addEventListener("click", () => {
  addRow();
  assignPositionsFromEliminationOrder();
});
refs.applyCountBtn.addEventListener("click", () => {
  setParticipantRows(Number(refs.participantCount?.value || 1));
});
refs.openNewParticipantBtn.addEventListener("click", () => {
  refs.modal.style.display = "flex";
  refs.newParticipantInput.value = "";
  refs.newParticipantInput.focus();
});
refs.cancelNewParticipantBtn.addEventListener("click", () => {
  refs.modal.style.display = "none";
});
refs.confirmNewParticipantBtn.addEventListener("click", () => {
  (async () => {
    try {
      await addPlayerFromInput();
    } catch (error) {
      alert(error.message);
    }
  })();
});
refs.openGainsModalBtn.addEventListener("click", () => {
  if (String(refs.sessionStatusInput?.value || "open") !== "closed") {
    alert("Passe la session en statut 'Fermee' pour repartir les gains.");
    return;
  }
  updateGainsPoolInfo();
  buildGainSelectOptions();
  refs.gainsModal.style.display = "flex";
  refs.gainFirstInput.value = gainsSplit ? String(normalizeGainValue(gainsSplit.first, getSelectedMisesTotal())) : "0";
  refs.gainSecondInput.value = gainsSplit ? String(normalizeGainValue(gainsSplit.second, getSelectedMisesTotal())) : "0";
  refs.gainThirdInput.value = gainsSplit ? String(normalizeGainValue(gainsSplit.third, getSelectedMisesTotal())) : "0";
  updateDistributedInfo();
  refs.gainFirstInput.focus();
});
refs.cancelGainsModalBtn.addEventListener("click", () => {
  refs.gainsModal.style.display = "none";
});
refs.confirmGainsModalBtn.addEventListener("click", () => {
  (async () => {
    try {
      confirmGainsSplit();
    } catch (error) {
      alert(error.message);
    }
  })();
});
refs.saveBtn.addEventListener("click", () => {
  (async () => {
    try {
      await finalizeSessionAndGoHome();
    } catch (error) {
      alert(error.message);
    }
  })();
});
refs.tbody.addEventListener("click", (e) => {
  if (!(e.target instanceof HTMLElement)) return;
  if (e.target.classList.contains("removeRow")) {
    e.target.closest("tr")?.remove();
    assignPositionsFromEliminationOrder();
    updateGainsPoolInfo();
  }
});
refs.tbody.addEventListener("change", (e) => {
  if (!(e.target instanceof HTMLElement)) return;
  if (e.target.classList.contains("p-player") || e.target.classList.contains("p-position")) {
    enforceUniqueSelections();
    if (e.target.classList.contains("p-position")) {
      applyPositionShift(e.target);
      recalculateDisplayedGains();
    }
  }
  if (e.target.classList.contains("p-mise")) {
    sanitizeMiseInput(e.target);
    updateGainsPoolInfo();
    updateGainsButtonLabel();
  }
  if (e.target.classList.contains("p-eliminated")) {
    assignPositionsFromEliminationOrder();
  }
  if (e.target.classList.contains("p-mise") && refs.gainsModal.style.display === "flex") {
    buildGainSelectOptions();
    updateDistributedInfo();
  }
});
refs.sessionStatusInput?.addEventListener("change", () => {
  const isClosed = String(refs.sessionStatusInput?.value || "open") === "closed";
  if (!isClosed) {
    gainsSplit = null;
    recalculateDisplayedGains();
  }
  updateGainsButtonLabel();
});
for (const gainSelect of [refs.gainFirstInput, refs.gainSecondInput, refs.gainThirdInput]) {
  gainSelect?.addEventListener("change", updateDistributedInfo);
}
refs.modal.addEventListener("click", (e) => {
  if (e.target === refs.modal) refs.modal.style.display = "none";
});
refs.gainsModal.addEventListener("click", (e) => {
  if (e.target === refs.gainsModal) refs.gainsModal.style.display = "none";
});

loadData().catch((error) => {
  console.error(error);
  alert("Impossible de charger les donnees depuis l'API.");
});
