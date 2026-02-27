const API_BASES = window.location.origin?.startsWith("http")
  ? ["", "http://localhost:8000"]
  : ["http://localhost:8000"];

async function apiFetch(path, options = {}) {
  let lastError = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
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
let mises = [];
let sessionsData = { session: [] };
let playersData = { session: [] };
let gainsSplit = null;
const editSessionId = new URLSearchParams(window.location.search).get("editSessionId");

function updateGainsButtonLabel() {
  const base = "Valider les gains";
  if (!refs.openGainsModalBtn) return;
  if (!gainsSplit) {
    refs.openGainsModalBtn.textContent = base;
    return;
  }
  const total = Number(gainsSplit.first || 0) + Number(gainsSplit.second || 0) + Number(gainsSplit.third || 0);
  refs.openGainsModalBtn.textContent = `${base} (Total: ${total})`;
}

function getSelectedMisesTotal() {
  let total = 0;
  for (const row of refs.tbody.querySelectorAll("tr")) {
    const miseId = String(row.querySelector(".p-mise")?.value || "").trim();
    if (!miseId) continue;
    const found = mises.find((m) => String(m.id) === miseId);
    total += Number(found?.mise || 0);
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

function addRow(prefill = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><select class="p-player">${optionList(players, "id", "name")}</select></td>
    <td><select class="p-position">${optionList(positions, "id", "rang")}</select></td>
    <td><select class="p-mise">${optionList(mises, "id", "mise")}</select></td>
    <td class="p-gain-view">${Number(prefill.gain ?? 0)}</td>
    <td><button class="btn removeRow" type="button">Supprimer</button></td>
  `;
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
  if (prefill.mise_id) tr.querySelector(".p-mise").value = String(prefill.mise_id);
  enforceUniqueSelections();
  sortRowsByPosition();
  recalculateDisplayedGains();
  updateGainsPoolInfo();
}

function setParticipantRows(count) {
  const n = Math.max(1, Number(count) || 1);
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

function getSortedPositionDefs() {
  return [...positions].sort((a, b) => Number(a.rang) - Number(b.rang));
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
  if (!id || !name) throw new Error("ID et nom de session obligatoires.");

  const rows = [...refs.tbody.querySelectorAll("tr")];
  if (rows.length === 0) throw new Error("Ajoute au moins un participant.");

  const participants = rows.map((tr) => {
    const joueurId = String(tr.querySelector(".p-player")?.value || "").trim();
    const positionId = String(tr.querySelector(".p-position")?.value || "").trim();
    if (!joueurId) throw new Error("Chaque participant doit avoir un joueur.");
    if (!positionId) throw new Error("Chaque participant doit avoir une position.");

    return {
      joueur_id: joueurId,
      position_id: positionId,
      mise_id: String(tr.querySelector(".p-mise")?.value || ""),
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

  return { id, name, participants };
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
    (sessions || []).map((s) => [String(s.session_id), { id: String(s.session_id), name: String(s.session_name || ""), participants: [] }])
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
      mise_id: String(mise / 10 || ""),
      gain: Number(payoutTotals.get(key) || 0)
    });
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
  refs.participantCount.value = String(Math.max(1, (target.participants || []).length));
  refs.tbody.innerHTML = "";

  const participants = [...(target.participants || [])].sort((a, b) => {
    const ar = rankByPositionId(String(a.position_id || "").trim()) ?? 999;
    const br = rankByPositionId(String(b.position_id || "").trim()) ?? 999;
    return ar - br;
  });
  for (const p of participants) addRow(p);

  gainsSplit = inferGainsSplitFromSession(target);
  recalculateDisplayedGains();
  updateGainsButtonLabel();
  updateGainsPoolInfo();
}

async function saveSessionJson() {
  if (!gainsSplit) {
    throw new Error("Valide les gains du top 3 avant d'enregistrer la session.");
  }

  const newSession = buildNewSession(); // { id, name, participants }
  const existing = (sessionsData.session || []).some((s) => String(s.id) === String(newSession.id));

  if (existing) {
    await apiFetch(`/api/sessions/${encodeURIComponent(newSession.id)}`, { method: "DELETE" });
  }

  await apiFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      session_id: Number(newSession.id),
      session_name: newSession.name
    })
  });

  for (const p of newSession.participants) {
    await apiFetch("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        session_id: Number(newSession.id),
        player_id: Number(p.joueur_id),
        position_id: Number(p.position_id)
      })
    });

    const miseDef = mises.find((m) => String(m.id) === String(p.mise_id));
    const totalMise = Number(miseDef?.mise || 0);
    const buyinCount = Math.max(0, Math.min(3, Math.floor(totalMise / 10)));
    for (let i = 0; i < buyinCount; i += 1) {
      await apiFetch("/api/buyins", {
        method: "POST",
        body: JSON.stringify({
          session_id: Number(newSession.id),
          player_id: Number(p.joueur_id)
        })
      });
    }

    if (Number(p.gain || 0) > 0) {
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
  const [posRes, mRes, apiPlayers, apiSessions, apiEntries, apiBuyins, apiPayouts] = await Promise.all([
    fetch("./data/positions.json", { cache: "no-store" }),
    fetch("./data/mises.json", { cache: "no-store" }),
    apiFetch("/api/players"),
    apiFetch("/api/sessions"),
    apiFetch("/api/entries"),
    apiFetch("/api/buyins"),
    apiFetch("/api/payouts")
  ]);

  const posJson = await posRes.json();
  const mJson = await mRes.json();

  players = (apiPlayers || []).map((p) => ({
    id: String(p.player_id),
    name: String(p.player_name || "").trim()
  }));
  playersData = { session: [...players] };
  positions = Array.isArray(posJson.session) ? posJson.session : [];
  mises = Array.isArray(mJson.session) ? mJson.session : [];
  sessionsData = {
    session: buildStructuredSessionsFromApi(apiSessions, apiEntries, apiBuyins, apiPayouts)
  };

  const maxSessionId = Math.max(0, ...sessionsData.session.map((s) => Number(s.id) || 0));
  if (editSessionId) {
    applyEditModeIfNeeded();
  } else {
    refs.sessionId.value = String(maxSessionId + 1);
    refs.sessionName.value = `Poker ${maxSessionId + 1}`;
    setParticipantRows(Number(refs.participantCount?.value || 8));
    updateGainsButtonLabel();
    updateGainsPoolInfo();
  }
}

refs.addRowBtn.addEventListener("click", () => addRow());
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
      await finalizeSessionAndGoHome();
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
    enforceUniqueSelections();
    sortRowsByPosition();
    recalculateDisplayedGains();
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
  if (e.target.classList.contains("p-mise")) updateGainsPoolInfo();
  if (e.target.classList.contains("p-mise") && refs.gainsModal.style.display === "flex") {
    buildGainSelectOptions();
    updateDistributedInfo();
  }
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
