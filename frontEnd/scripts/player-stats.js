import { escapeHTML, formatAmount } from "./lib/home-helpers.js";

const API_BASES = window.location.origin?.startsWith("http")
  ? ["", "http://localhost:8000"]
  : ["http://localhost:8000"];

const els = {
  main: document.querySelector("main.container"),
  refreshBtn: document.getElementById("refreshBtn"),
  playerButtons: document.getElementById("playerButtons"),
  statusMsg: document.getElementById("statusMsg"),
  statsCards: document.getElementById("statsCards"),
  sessionsBody: document.getElementById("sessionsBody")
};

const state = {
  rows: [],
  playerNameById: {},
  playerOptions: [],
  selectedPlayerId: ""
};

function setStatus(text) {
  if (!els.statusMsg) return;
  els.statusMsg.textContent = text;
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

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildPlayerRows(players, sessions, entries, buyins, payouts) {
  const sessionNameById = Object.fromEntries(
    (sessions || []).map((s) => [String(s.session_id), String(s.session_name || `Session ${s.session_id}`)])
  );
  const playerNameById = Object.fromEntries(
    (players || []).map((p) => [String(p.player_id), String(p.player_name || "").trim()])
  );

  const buyinTotals = new Map();
  for (const row of (buyins || [])) {
    const key = `${row.session_id}|${row.player_id}`;
    buyinTotals.set(key, (buyinTotals.get(key) || 0) + toNumber(row.amount));
  }

  const payoutTotals = new Map();
  for (const row of (payouts || [])) {
    const key = `${row.session_id}|${row.player_id}`;
    payoutTotals.set(key, (payoutTotals.get(key) || 0) + toNumber(row.amount));
  }

  const rows = (entries || []).map((entry) => {
    const sessionId = String(entry.session_id);
    const playerId = String(entry.player_id);
    const key = `${sessionId}|${playerId}`;
    const buyin = toNumber(buyinTotals.get(key));
    const payout = toNumber(payoutTotals.get(key));
    return {
      sessionId,
      sessionName: String(sessionNameById[sessionId] || `Session ${sessionId}`),
      playerId,
      playerName: String(entry.player_name || playerNameById[playerId] || playerId),
      position: toNumber(entry.rank_no),
      buyin,
      payout,
      net: payout - buyin
    };
  });

  rows.sort((a, b) => Number(a.sessionId) - Number(b.sessionId));
  return { rows, playerNameById };
}

function buildPlayerOptions() {
  const totalsByPlayer = new Map();
  for (const row of state.rows) {
    totalsByPlayer.set(row.playerId, (totalsByPlayer.get(row.playerId) || 0) + 1);
  }

  return Object.entries(state.playerNameById)
    .map(([playerId, playerName]) => ({
      playerId,
      playerName,
      participations: totalsByPlayer.get(playerId) || 0
    }))
    .filter((p) => p.participations > 0)
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "fr", { sensitivity: "base" }));
}

function renderPlayerButtons() {
  const current = String(state.selectedPlayerId || "");
  const byUrl = new URLSearchParams(window.location.search).get("playerId");
  const preferred = String(byUrl || current || "");
  if (preferred && state.playerOptions.some((p) => p.playerId === preferred)) {
    state.selectedPlayerId = preferred;
  } else if (!state.playerOptions.length) {
    state.selectedPlayerId = "";
  } else if (!state.selectedPlayerId) {
    state.selectedPlayerId = state.playerOptions[0].playerId;
  }

  els.playerButtons.innerHTML = state.playerOptions.map((p) => {
    const active = p.playerId === state.selectedPlayerId ? "is-active" : "";
    return `<button class="playerBtn ${active}" type="button" data-player-id="${escapeHTML(p.playerId)}">${escapeHTML(p.playerName)}</button>`;
  }).join("");

  els.playerButtons.querySelectorAll(".playerBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextId = String(btn.dataset.playerId || "");
      if (!nextId || nextId === state.selectedPlayerId) return;
      state.selectedPlayerId = nextId;
      renderPlayerButtons();
      renderForSelectedPlayerSmooth();
    });
  });
}

function getPlayerStats(rows) {
  const sessionCount = new Set(rows.map((r) => r.sessionId)).size;
  const participations = rows.length;
  const wins = rows.filter((r) => r.position === 1).length;
  const second = rows.filter((r) => r.position === 2).length;
  const third = rows.filter((r) => r.position === 3).length;
  const top3 = rows.filter((r) => r.position > 0 && r.position <= 3).length;
  const totalBuyins = rows.reduce((acc, r) => acc + r.buyin, 0);
  const totalPayouts = rows.reduce((acc, r) => acc + r.payout, 0);
  const net = rows.reduce((acc, r) => acc + r.net, 0);
  const avgBuyin = participations ? totalBuyins / participations : 0;
  const avgBuyinPerSession = sessionCount ? totalBuyins / sessionCount : 0;
  const avgPayoutPerSession = sessionCount ? totalPayouts / sessionCount : 0;
  const validPositions = rows.filter((r) => r.position > 0).map((r) => r.position);
  const avgPosition = validPositions.length
    ? (validPositions.reduce((acc, v) => acc + v, 0) / validPositions.length)
    : null;
  return {
    sessionCount,
    participations,
    wins,
    second,
    third,
    top3,
    totalBuyins,
    totalPayouts,
    net,
    avgBuyin,
    avgBuyinPerSession,
    avgPayoutPerSession,
    avgPosition
  };
}

function renderCards(rows, playerName) {
  if (!rows.length) {
    els.statsCards.innerHTML = "";
    setStatus("Aucune donnée pour ce joueur.");
    return;
  }

  const stats = getPlayerStats(rows);
  const avgPositionText = stats.avgPosition == null ? "-" : stats.avgPosition.toFixed(2).replace(".", ",");
  const cards = [
    { k: "Nombre de participations", v: String(stats.participations) },
    { k: "Argent total dépensé", v: `${formatAmount(stats.totalBuyins)} €` },
    { k: "Mise moyenne au total", v: `${formatAmount(stats.avgBuyin)} €` },
    { k: "Gains totaux", v: `${formatAmount(stats.totalPayouts)} €` },
    { k: "Mises moyennes par session", v: `${formatAmount(stats.avgBuyinPerSession)} €` },
    { k: "Gains moyens par session", v: `${formatAmount(stats.avgPayoutPerSession)} €` },
    { k: "Position moyenne", v: avgPositionText },
    { k: "Bénéfice net", v: `${formatAmount(stats.net)} €` }
  ];

  if (stats.wins > 0) cards.push({ k: "Victoires", v: String(stats.wins) });
  if (stats.second > 0) cards.push({ k: "2e place", v: String(stats.second) });
  if (stats.third > 0) cards.push({ k: "3e place", v: String(stats.third) });
  if (stats.top3 > 0) cards.push({ k: "Top 3", v: String(stats.top3) });

  els.statsCards.innerHTML = cards.map((c) => `
    <article class="card">
      <div class="card__k">${escapeHTML(c.k)}</div>
      <div class="card__v">${escapeHTML(c.v)}</div>
    </article>
  `).join("");

}

function renderSessionsTable(rows) {
  if (!rows.length) {
    els.sessionsBody.innerHTML = `
      <tr>
        <td colspan="6">Aucune session à afficher.</td>
      </tr>
    `;
    return;
  }

  let cumulativeNet = 0;
  els.sessionsBody.innerHTML = rows.map((row) => {
    cumulativeNet += row.net;
    const netClass = row.net > 0 ? "moneyPos" : (row.net < 0 ? "moneyNeg" : "");
    const cumClass = cumulativeNet > 0 ? "moneyPos" : (cumulativeNet < 0 ? "moneyNeg" : "");
    return `
      <tr>
        <td>${escapeHTML(row.sessionName)}</td>
        <td>${escapeHTML(String(row.position || "-"))}</td>
        <td>${escapeHTML(formatAmount(row.buyin))} €</td>
        <td>${escapeHTML(formatAmount(row.payout))} €</td>
        <td class="${netClass}">${escapeHTML(formatAmount(row.net))} €</td>
        <td class="${cumClass}">${escapeHTML(formatAmount(cumulativeNet))} €</td>
      </tr>
    `;
  }).join("");
}

function renderForSelectedPlayer() {
  const playerId = String(state.selectedPlayerId || "").trim();
  if (!playerId) {
    els.statsCards.innerHTML = "";
    els.sessionsBody.innerHTML = `
      <tr>
        <td colspan="6">Sélectionne un joueur pour afficher ses stats.</td>
      </tr>
    `;
    setStatus("Prêt.");
    return;
  }

  const rows = state.rows.filter((r) => r.playerId === playerId);
  const playerName = state.playerNameById[playerId] || playerId;
  renderCards(rows, playerName);
  renderSessionsTable(rows);
}

function renderForSelectedPlayerSmooth() {
  if (!els.main) {
    renderForSelectedPlayer();
    return;
  }
  els.main.classList.add("is-updating");
  window.requestAnimationFrame(() => {
    renderForSelectedPlayer();
    window.setTimeout(() => {
      els.main.classList.remove("is-updating");
    }, 170);
  });
}

async function loadData() {
  setStatus("Chargement des données…");
  els.refreshBtn.disabled = true;
  try {
    const [players, sessions, entries, buyins, payouts] = await Promise.all([
      apiFetch("/api/players"),
      apiFetch("/api/sessions"),
      apiFetch("/api/entries"),
      apiFetch("/api/buyins"),
      apiFetch("/api/payouts")
    ]);

    const built = buildPlayerRows(players, sessions, entries, buyins, payouts);
    state.rows = built.rows;
    state.playerNameById = built.playerNameById;
    state.playerOptions = buildPlayerOptions();

    renderPlayerButtons();
    renderForSelectedPlayer();
  } catch (err) {
    console.error(err);
    els.statsCards.innerHTML = "";
    els.sessionsBody.innerHTML = `
      <tr>
        <td colspan="6">Erreur de chargement API.</td>
      </tr>
    `;
    setStatus(`Erreur: ${String(err?.message || "API inaccessible")}`);
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.refreshBtn.addEventListener("click", loadData);

loadData();
