const DEFAULT_STACK_PER_10 = 10000;
const CHIP_CONFIG = [
  { key: "orange", label: "orange", defaultValue: 50 },
  { key: "black", label: "noir", defaultValue: 100 },
  { key: "green", label: "vert", defaultValue: 500 },
  { key: "yellow", label: "jaune", defaultValue: 1000 },
  { key: "red", label: "rouge", defaultValue: 5000 },
  { key: "white", label: "blanc", defaultValue: 10000 }
];

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const API_BASES = window.location.origin?.startsWith("http")
  ? (isLocalhost ? ["", "http://localhost:8000"] : [""])
  : ["http://localhost:8000"];

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
  ongoingSession: null,
  ongoingPlayers: [],
  selectedOngoingPlayerId: ""
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

function compareSessionIdsDesc(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
  return String(b).localeCompare(String(a), "fr", { numeric: true, sensitivity: "base" });
}

async function apiFetch(path) {
  let lastError = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`);
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

function setValidationStatus(text) {
  if (!els.validationStatus) return;
  els.validationStatus.textContent = text;
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

function getSelectedOngoingPlayer() {
  const id = String(state.selectedOngoingPlayerId || "").trim();
  if (!id) return null;
  return state.ongoingPlayers.find((p) => p.playerId === id) || null;
}

function updateOngoingPlayerReminder() {
  if (!els.ongoingPlayerReminder) return;

  const session = state.ongoingSession;
  if (!session) {
    els.ongoingPlayerReminder.textContent = "Aucune session en cours détectée.";
    return;
  }

  const player = getSelectedOngoingPlayer();
  if (!player) {
    els.ongoingPlayerReminder.textContent = `Session ${session.name}: sélectionne un joueur pour afficher son stack de rappel.`;
    return;
  }

  const buyinsText = `${formatNumber(player.buyinAmount, 0)} €`;
  const stackRefText = formatNumber(player.referenceStack, 0);
  els.ongoingPlayerReminder.textContent = `${player.playerName} | Mises: ${buyinsText} | Stack de rappel: ${stackRefText} (10 € = ${formatNumber(session.stackPer10, 0)})`;
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
  const fallbackPlayerName = selectedPlayer?.playerName || "";
  const typedPlayerName = String(els.playerNameInput?.value || "").trim();
  const playerName = typedPlayerName || fallbackPlayerName;
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

function validateCalculation() {
  const calc = updateCalculations();
  const player = calc.playerName || "Joueur";
  const blindText = calc.blind > 0
    ? `${formatTrimmed(calc.blindsExact, 2)} blindes (${formatNumber(calc.blindsFull, 0)} complètes)`
    : "blinde non renseignée";

  const reminder = getSelectedOngoingPlayer();
  if (reminder) {
    const delta = calc.totalStack - reminder.referenceStack;
    const deltaSign = delta > 0 ? "+" : "";
    const deltaText = `${deltaSign}${formatNumber(delta, 0)}`;
    setValidationStatus(`Calcul validé pour ${player}: stack ${formatNumber(calc.totalStack, 0)} | ${blindText} | Écart vs rappel session: ${deltaText}`);
    return;
  }
  setValidationStatus(`Calcul validé pour ${player}: stack ${formatNumber(calc.totalStack, 0)} | ${blindText}`);
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
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Sélectionner un joueur";
  els.ongoingPlayerSelect.appendChild(placeholder);
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

async function loadOngoingSessionReminder() {
  if (els.ongoingSessionInfo) {
    els.ongoingSessionInfo.textContent = "Chargement de la session en cours...";
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

    const ongoingSessions = (sessions || [])
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
      .filter((s) => s.isOngoing)
      .sort((a, b) => compareSessionIdsDesc(a.id, b.id));

    if (!ongoingSessions.length) {
      state.ongoingSession = null;
      state.ongoingPlayers = [];
      state.selectedOngoingPlayerId = "";
      updateOngoingPlayerOptions();
      if (els.ongoingSessionInfo) {
        els.ongoingSessionInfo.textContent = "Aucune session en cours trouvée.";
      }
      updateOngoingPlayerReminder();
      return;
    }

    const session = ongoingSessions[0];
    state.ongoingSession = session;
    if (els.ongoingSessionInfo) {
      els.ongoingSessionInfo.textContent = `Session en cours: ${session.name} | Référence stack: 10 € = ${formatNumber(session.stackPer10, 0)}`;
    }

    const playersInSession = (entries || [])
      .filter((e) => String(e.session_id) === session.id)
      .map((e) => {
        const pid = String(e.player_id);
        const playerName = String(e.player_name || playerNameById[pid] || pid);
        const buyinAmount = Number(buyinTotalsBySessionPlayer.get(`${session.id}|${pid}`) || 0);
        const referenceStack = Math.round((buyinAmount / 10) * session.stackPer10);
        return {
          playerId: pid,
          playerName,
          buyinAmount,
          referenceStack
        };
      })
      .sort((a, b) => a.playerName.localeCompare(b.playerName, "fr", { sensitivity: "base" }));

    state.ongoingPlayers = playersInSession;
    updateOngoingPlayerOptions();
    const selected = getSelectedOngoingPlayer();
    if (selected && els.playerNameInput instanceof HTMLInputElement && !String(els.playerNameInput.value || "").trim()) {
      els.playerNameInput.value = selected.playerName;
    }
    updateOngoingPlayerReminder();
  } catch (err) {
    state.ongoingSession = null;
    state.ongoingPlayers = [];
    state.selectedOngoingPlayerId = "";
    updateOngoingPlayerOptions();
    if (els.ongoingSessionInfo) {
      els.ongoingSessionInfo.textContent = `Impossible de charger la session en cours (${String(err?.message || "erreur API")}).`;
    }
    updateOngoingPlayerReminder();
  }
}

function bindEvents() {
  for (const chip of chipRefs) {
    chip.valueInput?.addEventListener("input", updateCalculations);
    chip.countInput?.addEventListener("input", updateCalculations);
  }

  els.playerNameInput?.addEventListener("input", updateCalculations);
  els.blindAmountInput?.addEventListener("input", updateCalculations);

  els.ongoingPlayerSelect?.addEventListener("change", () => {
    if (!(els.ongoingPlayerSelect instanceof HTMLSelectElement)) return;
    state.selectedOngoingPlayerId = String(els.ongoingPlayerSelect.value || "").trim();
    const selected = getSelectedOngoingPlayer();
    if (selected && els.playerNameInput instanceof HTMLInputElement && !String(els.playerNameInput.value || "").trim()) {
      els.playerNameInput.value = selected.playerName;
    }
    updateOngoingPlayerReminder();
    updateCalculations();
  });

  els.validateBtn?.addEventListener("click", validateCalculation);

  els.resetBtn?.addEventListener("click", () => {
    applyDefaults();
    setValidationStatus("Aucun calcul validé pour le moment.");
    updateCalculations();
  });
}

applyDefaults();
bindEvents();
setValidationStatus("Aucun calcul validé pour le moment.");
updateCalculations();
loadOngoingSessionReminder().then(() => {
  updateCalculations();
});
