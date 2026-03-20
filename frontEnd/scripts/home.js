import {
  LS_PLAYERS_KEY,
  LS_SESSION_KEY,
  loadJsonWithOverride,
  readLocalOverride,
  writeLocalOverride
} from "./lib/local-overrides.js";
import {
  escapeAttr,
  escapeHTML,
  formatAmount,
  normalizeText,
  parseCSV,
  parseMoney,
  toColumnLabel,
  toObjects
} from "./lib/home-helpers.js";

// === CONFIG ===
const DATASETS_URL = "./data/datasets.json";
const LOCAL_JSON_URL = "./data/session.json";
const LOCAL_CSV_URL = "./data/poker_benefice_net.csv";
const TABLE_LAYOUT_URL = "./data/poker_tableau_layout.json";
const PLAYERS_URL = "./data/players.json";
const POSITIONS_URL = "./data/positions.json";
const MISES_URL = "./data/mises.json";
const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const API_BASES = window.location.origin?.startsWith("http")
  ? (isLocalhost ? ["", "http://localhost:8000"] : [""])
  : ["http://localhost:8000"];
const ADMIN_KEY_STORAGE = "poker_admin_key";
const ADMIN_DEFAULT_KEY = "poker_admin_local";
const ADMIN_CODE_STORAGE = "poker_admin_code";

const els = {
  statusBadge: document.getElementById("statusBadge"),
  datasetSelect: document.getElementById("datasetSelect"),
  sessionField: document.getElementById("sessionField"),
  sessionSelect: document.getElementById("sessionSelect"),
  searchInput: document.getElementById("searchInput"),
  columnSelect: document.getElementById("columnSelect"),
  columnFilterInput: document.getElementById("columnFilterInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  importBtn: document.getElementById("importBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  statsCards: document.getElementById("statsCards"),
  leaderboard: document.getElementById("leaderboard"),
  leaderboardMeta: document.getElementById("leaderboardMeta"),
  dataPanel: document.getElementById("dataPanel"),
  rowCount: document.getElementById("rowCount"),
  colCount: document.getElementById("colCount"),
  table: document.getElementById("dataTable"),
  thead: document.querySelector("#dataTable thead"),
  tbody: document.querySelector("#dataTable tbody"),
};

let rawRows = [];
let headers = [];
let viewRows = [];
let sortState = { key: null, dir: "asc" };
let datasetsCatalog = [];
let activeDatasetId = "";
let sheetLayout = null;
let playersById = null;
let positionsById = null;
let misesById = null;
let importedDatasetName = "";
let summarySortState = { key: "net", dir: "desc", sessionId: "" };
let sessionMetaById = new Map();
let ongoingSessionIds = new Set();

const MONEY_HEADERS = /(benefice|bénéfice|resultat|résultat|solde|net|gain|profit)/i;
const PLAYER_HEADERS = /(joueur|player|pseudo|nom)/i;

function isSpreadsheetMode() {
  return activeDatasetId === "tableau_complet";
}

function isOriginalSheetMode() {
  return isSpreadsheetMode() && sheetLayout && Array.isArray(sheetLayout.rows) && sheetLayout.rows.length > 0;
}

function displayHeaderName(header, idx) {
  if (isSpreadsheetMode()) return toColumnLabel(idx);
  return header;
}

function isSessionOngoingById(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return false;
  const meta = sessionMetaById.get(sid);
  if (meta && typeof meta.is_ongoing === "boolean") return meta.is_ongoing;
  return ongoingSessionIds.has(sid);
}

function isRowInOngoingSession(row) {
  return isSessionOngoingById(String(row?.session_numero || "").trim());
}

function getValidatedRows(rows) {
  return (rows || []).filter((row) => !isRowInOngoingSession(row));
}

function compareSessionIdsWithOngoingFirst(a, b) {
  const sidA = String(a || "").trim();
  const sidB = String(b || "").trim();
  const ongoingA = isSessionOngoingById(sidA);
  const ongoingB = isSessionOngoingById(sidB);
  if (ongoingA !== ongoingB) return ongoingA ? -1 : 1;

  const na = Number(sidA);
  const nb = Number(sidB);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    if (ongoingA) return nb - na;
    return na - nb;
  }
  return sidA.localeCompare(sidB, "fr", { numeric: true, sensitivity: "base" });
}

function buildSessionLabel(sessionId, fallbackName = "") {
  const sid = String(sessionId || "").trim();
  const base = String(fallbackName || `Session ${sid}`).trim() || `Session ${sid}`;
  return isSessionOngoingById(sid) ? `${base} (en cours)` : base;
}

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const normalized = Math.trunc(n);
  return normalized > 0 ? normalized : null;
}

function setStatus(text, kind = "idle") {
  els.statusBadge.textContent = text;
  const colors = {
    idle: "rgba(255,255,255,.03)",
    ok: "rgba(46,204,113,.12)",
    warn: "rgba(241,196,15,.12)",
    bad: "rgba(231,76,60,.12)"
  };
  els.statusBadge.style.background = colors[kind] || colors.idle;
  els.statusBadge.style.borderColor = "rgba(29,42,68,.85)";
}

function applyFilters() {
  const q = normalizeText(els.searchInput?.value ?? "");
  const col = els.columnSelect?.value ?? "";
  const colNeedle = normalizeText(els.columnFilterInput?.value ?? "");
  const selectedSession = String(els.sessionSelect?.value ?? "");

  let out = [...rawRows];

  if (isSessionRows() && selectedSession) {
    out = out.filter(obj => String(obj.session_numero ?? "") === selectedSession);
  }

  // Recherche globale
  if (q) {
    out = out.filter(obj => headers.some(h => normalizeText(obj[h]).includes(q)));
  }

  // Filtre sur colonne spécifique
  if (col && colNeedle) {
    out = out.filter(obj => normalizeText(obj[col]).includes(colNeedle));
  }

  viewRows = out;
  applySort();
  render();
}

function buildSessionSelect() {
  if (!els.sessionSelect || !els.sessionField) return;
  if (!isSessionRows()) {
    els.sessionField.classList.add("isHidden");
    els.sessionSelect.innerHTML = "";
    return;
  }

  const current = String(els.sessionSelect.value || "");
  const sessions = [...new Set(rawRows.map(r => String(r.session_numero ?? "").trim()).filter(Boolean))]
    .sort(compareSessionIdsWithOngoingFirst);
  const nameById = {};
  for (const row of rawRows) {
    const sid = String(row.session_numero ?? "").trim();
    const sname = String(row.session_nom ?? "").trim();
    if (sid && sname && !nameById[sid]) nameById[sid] = sname;
  }

  els.sessionField.classList.remove("isHidden");
  els.sessionSelect.innerHTML = `
    <option value="">Toutes les sessions</option>
    ${sessions.map((sid) => {
      const name = buildSessionLabel(sid, nameById[sid] || `Session ${sid}`);
      return `<option value="${escapeAttr(sid)}">${escapeHTML(name)}</option>`;
    }).join("")}
  `;

  if (current && sessions.includes(current)) {
    els.sessionSelect.value = current;
  } else {
    els.sessionSelect.value = "";
  }
}

function inferPokerColumns() {
  const playerCol = headers.find(h => PLAYER_HEADERS.test(h)) || null;
  const moneyCol = headers.find(h => MONEY_HEADERS.test(h)) || null;
  return { playerCol, moneyCol };
}

function computeLeaderboard(rows) {
  const { playerCol, moneyCol } = inferPokerColumns();
  if (!playerCol || !moneyCol) return { items: [], playerCol, moneyCol };

  const map = new Map();
  for (const row of rows) {
    const player = String(row[playerCol] ?? "").trim();
    const amount = parseMoney(row[moneyCol]);
    if (!player || amount === null) continue;
    map.set(player, (map.get(player) ?? 0) + amount);
  }

  const items = [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  return { items, playerCol, moneyCol };
}

function applySort() {
  const { key, dir } = sortState;
  if (!key) return;

  const mul = dir === "asc" ? 1 : -1;

  viewRows.sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";

    // Tri numérique si possible
    const an = Number(String(av).replace(",", "."));
    const bn = Number(String(bv).replace(",", "."));
    const aNum = Number.isFinite(an) && String(av).trim() !== "";
    const bNum = Number.isFinite(bn) && String(bv).trim() !== "";

    if (aNum && bNum) return (an - bn) * mul;

    return String(av).localeCompare(String(bv), "fr", {
      numeric: true,
      sensitivity: "base"
    }) * mul;
  });
}

function toggleSort(key) {
  if (isOriginalSheetMode()) return;
  if (sortState.key !== key) {
    sortState = { key, dir: "asc" };
  } else {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  }
  applySort();
  renderTableHead(); // met à jour les icônes
  renderTableBody();
}

function renderStats() {
  const total = rawRows.length;
  const shown = viewRows.length;

  if (isSessionRows()) {
    const validatedRows = getValidatedRows(viewRows);
    const sessions = new Set(validatedRows.map(r => String(r.session_numero ?? "").trim())).size;
    const participations = validatedRows.length;
    const joueurs = new Set(validatedRows.map(r => String(r.joueur_id ?? "").trim()).filter(Boolean)).size;
    const argentTotal = validatedRows.reduce((acc, r) => acc + (Number(r.gain ?? 0) || 0), 0);
    const totalMises = validatedRows.reduce((acc, r) => acc + (Number(r.mise ?? 0) || 0), 0);
    const miseMoyenne = participations ? (totalMises / participations) : 0;
    const gainsMoyensParSession = sessions ? (argentTotal / sessions) : 0;
    const misesMoyennesParSession = sessions ? (totalMises / sessions) : 0;
    const misesMoyennesParSessionParJoueur = joueurs ? (misesMoyennesParSession / joueurs) : 0;
    const sessionsEnCours = new Set(
      viewRows
        .filter((r) => isRowInOngoingSession(r))
        .map((r) => String(r.session_numero ?? "").trim())
        .filter(Boolean)
    ).size;

    const cards = [
      { k: "Nombre de sessions", v: sessions },
      { k: "Nombre de participations", v: participations },
      { k: "Argent total dépensé", v: `${formatAmount(argentTotal)} €` },
      { k: "Mise moyenne au total", v: `${formatAmount(miseMoyenne)} €` },
      { k: "Gains moyens par session", v: `${formatAmount(gainsMoyensParSession)} €` },
      { k: "Mises moyennes par session par joueur", v: `${formatAmount(misesMoyennesParSessionParJoueur)} €` },
      { k: "Sessions en cours (hors stats)", v: sessionsEnCours }
    ];

    els.statsCards.innerHTML = cards.map(c => `
      <div class="card">
        <div class="card__k">${escapeHTML(c.k)}</div>
        <div class="card__v">${escapeHTML(String(c.v))}</div>
      </div>
    `).join("");

    document.getElementById("rowCount").textContent = `${shown} lignes`;
    document.getElementById("colCount").textContent = `${headers.length} colonnes`;
    return;
  }

  const board = computeLeaderboard(viewRows);
  const positives = board.items.filter(x => x.amount > 0).length;
  const negatives = board.items.filter(x => x.amount < 0).length;
  const totalNet = board.items.reduce((acc, x) => acc + x.amount, 0);

  const cards = [
    { k: "Lignes (total)", v: total },
    { k: "Lignes (affichées)", v: shown },
    { k: "Colonnes", v: headers.length },
    { k: "Tri", v: sortState.key ? `${sortState.key} (${sortState.dir})` : "—" }
  ];

  if (board.items.length) {
    cards.push({ k: "Joueurs gagnants", v: positives });
    cards.push({ k: "Joueurs perdants", v: negatives });
    cards.push({ k: "Bénéfice net (filtre)", v: `${formatAmount(totalNet)} €` });
  }

  els.statsCards.innerHTML = cards.map(c => `
    <div class="card">
      <div class="card__k">${escapeHTML(c.k)}</div>
      <div class="card__v">${escapeHTML(String(c.v))}</div>
    </div>
  `).join("");

  document.getElementById("rowCount").textContent = `${shown} lignes`;
  document.getElementById("colCount").textContent = `${headers.length} colonnes`;
}

function renderLeaderboard() {
  if (isSpreadsheetMode()) {
    els.leaderboardMeta.textContent = "Tableau brut";
    els.leaderboard.innerHTML = `<div class="muted">Affichage type feuille active.</div>`;
    return;
  }

  if (isSessionRows()) {
    renderSessionSummaryTable();
    return;
  }

  const board = computeLeaderboard(viewRows);

  if (!board.playerCol || !board.moneyCol) {
    els.leaderboardMeta.textContent = "Colonnes Joueur/Benefice non detectees";
    els.leaderboard.innerHTML = `
      <div class="muted">Ajoute une colonne joueur et une colonne de resultat net pour afficher le classement.</div>
    `;
    return;
  }

  if (!board.items.length) {
    els.leaderboardMeta.textContent = "Aucune donnee exploitable";
    els.leaderboard.innerHTML = `<div class="muted">Aucun resultat numerique trouve.</div>`;
    return;
  }

  const maxAbs = Math.max(...board.items.map(x => Math.abs(x.amount)), 1);
  const leader = board.items[0];
  els.leaderboardMeta.textContent = `Leader: ${leader.name} (${formatAmount(leader.amount)} €)`;

  els.leaderboard.innerHTML = board.items.map((item, idx) => {
    const kind = item.amount >= 0 ? "pos" : "neg";
    const width = Math.max(6, (Math.abs(item.amount) / maxAbs) * 100);
    return `
      <div class="leaderRow">
        <div class="leaderRow__head">
          <span class="leaderName">#${idx + 1} ${escapeHTML(item.name)}</span>
          <span class="leaderVal ${kind}">${escapeHTML(formatAmount(item.amount))} €</span>
        </div>
        <div class="leaderTrack">
          <div class="leaderFill ${kind}" style="width:${width}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function isSessionRows() {
  const needed = ["session_numero", "session_nom", "joueur", "position", "mise", "gain"];
  return needed.every(k => headers.includes(k));
}

function renderSessionSummaryTable() {
  const validatedRows = getValidatedRows(viewRows);
  const sessionTablesHTML = renderSessionTablesHTML();

  const sessionNameById = {};
  for (const row of validatedRows) {
    const sid = String(row.session_numero ?? "").trim();
    const sname = String(row.session_nom ?? "").trim();
    if (sid && sname && !sessionNameById[sid]) sessionNameById[sid] = sname;
  }

  const sessionIds = [...new Set(validatedRows.map(r => String(r.session_numero ?? "").trim()).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b));
  const playerMap = new Map();

  for (const row of validatedRows) {
    const playerId = String(row.joueur_id ?? "").trim();
    const playerName = String(row.joueur ?? "").trim() || playerId;
    const sid = String(row.session_numero ?? "").trim();
    const pos = Number(row.position ?? "");
    const mise = Number(row.mise ?? "");
    const gain = Number(row.gain ?? "");

    const key = playerId || playerName;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        player: playerName,
        participations: 0,
        sessionPos: {},
        sumPos: 0,
        countPos: 0,
        wins: 0,
        second: 0,
        third: 0,
        top3: 0,
        gains: 0,
        mises: 0
      });
    }

    const p = playerMap.get(key);
    if (Number.isFinite(pos) && pos > 0) {
      p.participations += 1;
      p.sessionPos[sid] = pos;
      p.sumPos += pos;
      p.countPos += 1;
      if (pos === 1) p.wins += 1;
      if (pos === 2) p.second += 1;
      if (pos === 3) p.third += 1;
      if (pos <= 3) p.top3 += 1;
    }
    if (Number.isFinite(gain)) p.gains += gain;
    if (Number.isFinite(mise)) p.mises += mise;
  }

  let players = [...playerMap.values()]
    .map(p => ({
      ...p,
      avgPos: p.countPos ? p.sumPos / p.countPos : null,
      avgMise: p.participations ? p.mises / p.participations : 0,
      net: p.gains - p.mises
    }));

  players.sort((a, b) => compareSummaryPlayers(a, b));

  els.leaderboardMeta.textContent = `${players.length} joueurs (sessions validées)`;
  if (!players.length) {
    els.leaderboard.innerHTML = `
      <div class="muted">Aucune session validée à afficher dans les stats.</div>
      ${sessionTablesHTML}
    `;
    bindSessionCardActions();
    return;
  }

  const totals = {
    participations: players.reduce((a, p) => a + p.participations, 0),
    wins: players.reduce((a, p) => a + p.wins, 0),
    second: players.reduce((a, p) => a + p.second, 0),
    third: players.reduce((a, p) => a + p.third, 0),
    top3: players.reduce((a, p) => a + p.top3, 0),
    gains: players.reduce((a, p) => a + p.gains, 0),
    mises: players.reduce((a, p) => a + p.mises, 0)
  };
  totals.avgMise = totals.participations ? (totals.mises / totals.participations) : 0;
  totals.net = totals.gains - totals.mises;

  const sessionCounts = Object.fromEntries(sessionIds.map(sid => [sid, 0]));
  for (const row of validatedRows) {
    const sid = String(row.session_numero ?? "").trim();
    if (sid && Object.prototype.hasOwnProperty.call(sessionCounts, sid)) sessionCounts[sid] += 1;
  }

  const moneyClass = n => n > 0 ? "moneyPos" : (n < 0 ? "moneyNeg" : "");
  const fmtInt = n => String(Math.round(n));
  const fmtEuro = n => `${fmtInt(n)} €`;
  const fmtAvg = n => (n == null ? "-" : n.toFixed(1).replace(".", ","));
  const maxPart = Math.max(...players.map(p => p.participations), 1);

  const posClass = (v) => {
    if (!Number.isFinite(v) || v <= 0) return "posMissing";
    if (v === 1) return "pos1";
    if (v === 2) return "pos2";
    if (v === 3) return "pos3";
    if (v <= 5) return "posMid";
    return "posLow";
  };
  const avgPosClass = (v) => {
    if (v == null) return "avgMissing";
    if (v <= 3) return "avgGood";
    if (v <= 5) return "avgMid";
    return "avgBad";
  };
  const metricClass = (v) => Number(v) > 0 ? "metricGood" : "metricZero";
  const partClass = (v) => {
    const ratio = Number(v) / maxPart;
    if (ratio >= 0.85) return "partHigh";
    if (ratio >= 0.55) return "partMid";
    return "partLow";
  };

  els.leaderboard.innerHTML = `
    <div class="megaWrap">
      <table class="megaTable">
        <thead>
          <tr>
            <th rowspan="2" data-sort-key="player">Joueurs</th>
            <th rowspan="2" data-sort-key="participations">Nombre de Participations</th>
            <th colspan="${sessionIds.length}">Positions</th>
            <th rowspan="2" data-sort-key="avgPos">Position Moyenne</th>
            <th rowspan="2" data-sort-key="wins">Victoire</th>
            <th rowspan="2" data-sort-key="second">Seconde place</th>
            <th rowspan="2" data-sort-key="third">Troisième place</th>
            <th rowspan="2" data-sort-key="top3">Top 3</th>
            <th rowspan="2" data-sort-key="gains">Gains</th>
            <th rowspan="2" data-sort-key="mises">Mises</th>
            <th rowspan="2" data-sort-key="avgMise">Mises Moyennes</th>
            <th rowspan="2" data-sort-key="net">Bénéfice Net</th>
          </tr>
          <tr>
            ${sessionIds.map((sid) => {
              const label = sessionNameById[sid] || `Poker ${sid}`;
              return `<th data-sort-key="sessionPos" data-session-id="${escapeAttr(sid)}">${escapeHTML(label)}</th>`;
            }).join("")}
          </tr>
        </thead>
        <tbody>
          ${players.map(p => `
            <tr>
              <td>${escapeHTML(p.player)}</td>
              <td class="${partClass(p.participations)}">${p.participations}</td>
              ${sessionIds.map(sid => {
                const v = Number(p.sessionPos[sid] ?? NaN);
                const text = Number.isFinite(v) ? String(v) : "-";
                return `<td class="${posClass(v)}">${text}</td>`;
              }).join("")}
              <td class="${avgPosClass(p.avgPos)}">${fmtAvg(p.avgPos)}</td>
              <td class="${metricClass(p.wins)}">${p.wins}</td>
              <td class="${metricClass(p.second)}">${p.second}</td>
              <td class="${metricClass(p.third)}">${p.third}</td>
              <td class="${metricClass(p.top3)}">${p.top3}</td>
              <td class="moneyCol">${fmtEuro(p.gains)}</td>
              <td class="moneyCol">${fmtEuro(p.mises)}</td>
              <td class="moneyCol">${fmtEuro(p.avgMise)}</td>
              <td class="${moneyClass(p.net)}">${fmtEuro(p.net)}</td>
            </tr>
          `).join("")}
          <tr class="megaTotal">
            <td>Total</td>
            <td>${totals.participations}</td>
            ${sessionIds.map(sid => `<td>${sessionCounts[sid] || 0}</td>`).join("")}
            <td>-</td>
            <td>${totals.wins}</td>
            <td>${totals.second}</td>
            <td>${totals.third}</td>
            <td>${totals.top3}</td>
            <td>${fmtEuro(totals.gains)}</td>
            <td>${fmtEuro(totals.mises)}</td>
            <td>${fmtEuro(totals.avgMise)}</td>
            <td class="${moneyClass(totals.net)}">${fmtEuro(totals.net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ${sessionTablesHTML}
  `;

  const table = els.leaderboard.querySelector(".megaTable");
  table?.querySelectorAll("th[data-sort-key]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey || "";
      const sessionId = th.dataset.sessionId || "";
      if (summarySortState.key === key && summarySortState.sessionId === sessionId) {
        summarySortState.dir = summarySortState.dir === "asc" ? "desc" : "asc";
      } else {
        summarySortState = { key, dir: "asc", sessionId };
      }
      renderSessionSummaryTable();
    });
  });

  bindSessionCardActions();
}

function compareSummaryPlayers(a, b) {
  const mul = summarySortState.dir === "asc" ? 1 : -1;
  const { key, sessionId } = summarySortState;

  const va = getSummarySortValue(a, key, sessionId);
  const vb = getSummarySortValue(b, key, sessionId);

  const aNum = typeof va === "number";
  const bNum = typeof vb === "number";
  if (aNum && bNum) return (va - vb) * mul;
  return String(va).localeCompare(String(vb), "fr", { sensitivity: "base", numeric: true }) * mul;
}

function getSummarySortValue(p, key, sessionId) {
  if (key === "sessionPos") return Number(p.sessionPos[sessionId] ?? 999);
  if (key === "avgPos") return p.avgPos == null ? 999 : p.avgPos;
  if (key === "player") return p.player;
  return p[key];
}

function getSessionCardRows(sessionCard) {
  if (!(sessionCard instanceof HTMLElement)) return [];
  return [...sessionCard.querySelectorAll(".sessionCard__table tbody tr[data-player-id]")];
}

function getSessionCardRowRank(row) {
  return parsePositiveInt(row?.dataset?.rank);
}

function getSessionCardRowEliminationOrder(row) {
  return parsePositiveInt(row?.dataset?.eliminationOrder);
}

function setSessionCardRowEliminationOrder(row, order) {
  if (!(row instanceof HTMLElement)) return;
  const normalized = parsePositiveInt(order);
  if (normalized == null) {
    delete row.dataset.eliminationOrder;
    return;
  }
  row.dataset.eliminationOrder = String(normalized);
}

function setSessionCardRowRank(row, rank, rankToPositionId) {
  if (!(row instanceof HTMLElement)) return;
  const normalized = parsePositiveInt(rank);
  if (normalized == null) return;
  row.dataset.rank = String(normalized);
  const mappedPositionId = rankToPositionId.get(normalized);
  if (mappedPositionId) {
    row.dataset.positionId = mappedPositionId;
  }
  const rankCell = row.querySelector(".sessionRankCell");
  if (rankCell) rankCell.textContent = String(normalized);
  row.classList.remove("posGold", "posSilver", "posBronze");
  if (normalized === 1) row.classList.add("posGold");
  if (normalized === 2) row.classList.add("posSilver");
  if (normalized === 3) row.classList.add("posBronze");
}

function sortSessionCardRowsByRank(sessionCard) {
  const tbody = sessionCard?.querySelector(".sessionCard__table tbody");
  if (!(tbody instanceof HTMLElement)) return;
  const rows = getSessionCardRows(sessionCard);
  rows.sort((a, b) => {
    const ar = getSessionCardRowRank(a) ?? Number.POSITIVE_INFINITY;
    const br = getSessionCardRowRank(b) ?? Number.POSITIVE_INFINITY;
    return ar - br;
  });
  for (const row of rows) tbody.appendChild(row);
}

function getSessionCardRankToPositionIdMap(sessionCard) {
  const map = new Map();
  for (const row of getSessionCardRows(sessionCard)) {
    const rank = parsePositiveInt(row.dataset.baseRank || row.dataset.rank);
    const positionId = String(row.dataset.basePositionId || row.dataset.positionId || "").trim();
    if (rank != null && positionId) map.set(rank, positionId);
  }
  return map;
}

function assignSessionRanksFromEliminationOrder(sessionCard) {
  const rows = getSessionCardRows(sessionCard);
  if (!rows.length) return;

  let maxOrder = rows.reduce((max, row) => Math.max(max, getSessionCardRowEliminationOrder(row) || 0), 0);
  for (const row of rows) {
    if (row.dataset.eliminated === "1" && !getSessionCardRowEliminationOrder(row)) {
      maxOrder += 1;
      setSessionCardRowEliminationOrder(row, maxOrder);
    }
    if (row.dataset.eliminated !== "1") {
      setSessionCardRowEliminationOrder(row, null);
    }
  }

  const rowCount = rows.length;
  const rankToPositionId = getSessionCardRankToPositionIdMap(sessionCard);
  const eliminatedRows = rows
    .filter((row) => row.dataset.eliminated === "1")
    .sort((a, b) => (getSessionCardRowEliminationOrder(a) || 0) - (getSessionCardRowEliminationOrder(b) || 0));

  const desiredRankByRow = new Map();
  eliminatedRows.forEach((row, idx) => desiredRankByRow.set(row, rowCount - idx));

  const usedRanks = new Set();
  for (const row of eliminatedRows) {
    const rank = desiredRankByRow.get(row);
    if (rank == null) continue;
    setSessionCardRowRank(row, rank, rankToPositionId);
    usedRanks.add(rank);
  }

  const nonEliminatedRows = rows
    .filter((row) => !desiredRankByRow.has(row))
    .sort((a, b) => (getSessionCardRowRank(a) || Number.POSITIVE_INFINITY) - (getSessionCardRowRank(b) || Number.POSITIVE_INFINITY));

  const remainingRanks = [];
  for (let rank = 1; rank <= rowCount; rank += 1) {
    if (!usedRanks.has(rank)) remainingRanks.push(rank);
  }
  nonEliminatedRows.forEach((row, idx) => {
    const rank = remainingRanks[idx];
    if (rank == null) return;
    setSessionCardRowRank(row, rank, rankToPositionId);
    usedRanks.add(rank);
  });

  sortSessionCardRowsByRank(sessionCard);
}

function getSessionCardStateSignature(sessionCard) {
  const rows = getSessionCardRows(sessionCard).map((row) => ({
    playerId: String(row.dataset.playerId || "").trim(),
    rank: getSessionCardRowRank(row) || 0,
    isEliminated: row.dataset.eliminated === "1" ? 1 : 0,
    eliminationOrder: getSessionCardRowEliminationOrder(row) || 0
  }));
  rows.sort((a, b) => String(a.playerId).localeCompare(String(b.playerId), "fr", { numeric: true, sensitivity: "base" }));
  return JSON.stringify(rows);
}

function markSessionCardDirtyState(sessionCard) {
  if (!(sessionCard instanceof HTMLElement)) return;
  const current = getSessionCardStateSignature(sessionCard);
  const initial = String(sessionCard.dataset.initialStateSignature || "");
  const isDirty = current !== initial;
  sessionCard.dataset.dirty = isDirty ? "1" : "0";
  sessionCard.classList.toggle("sessionCard--dirty", isDirty);

  const confirmBtn = sessionCard.querySelector(".sessionConfirmEliminationBtn");
  if (confirmBtn instanceof HTMLButtonElement) {
    confirmBtn.disabled = !isDirty;
  }
  const hint = sessionCard.querySelector(".sessionPendingHint");
  if (hint instanceof HTMLElement) {
    hint.textContent = isDirty ? "Modifications non confirmees" : "Aucune modification";
    hint.classList.toggle("isDirty", isDirty);
  }
}

function initializeSessionCardEliminationState(sessionCard) {
  if (!(sessionCard instanceof HTMLElement)) return;
  if (sessionCard.dataset.sessionOngoing !== "1") return;

  const rows = getSessionCardRows(sessionCard);
  const eliminatedRows = rows
    .filter((row) => row.dataset.eliminated === "1")
    .sort((a, b) => {
      const ar = getSessionCardRowRank(a) ?? 0;
      const br = getSessionCardRowRank(b) ?? 0;
      return br - ar;
    });
  eliminatedRows.forEach((row, idx) => setSessionCardRowEliminationOrder(row, idx + 1));
  rows
    .filter((row) => row.dataset.eliminated !== "1")
    .forEach((row) => setSessionCardRowEliminationOrder(row, null));

  assignSessionRanksFromEliminationOrder(sessionCard);
  sessionCard.dataset.initialStateSignature = getSessionCardStateSignature(sessionCard);
  markSessionCardDirtyState(sessionCard);
}

function handleSessionEliminationToggle(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const row = input.closest("tr");
  const sessionCard = input.closest(".sessionCard");
  if (!(row instanceof HTMLElement) || !(sessionCard instanceof HTMLElement)) return;

  row.dataset.eliminated = input.checked ? "1" : "0";
  if (!input.checked) {
    setSessionCardRowEliminationOrder(row, null);
  } else if (!getSessionCardRowEliminationOrder(row)) {
    const rows = getSessionCardRows(sessionCard);
    const nextOrder = rows.reduce((max, item) => Math.max(max, getSessionCardRowEliminationOrder(item) || 0), 0) + 1;
    setSessionCardRowEliminationOrder(row, nextOrder);
  }

  assignSessionRanksFromEliminationOrder(sessionCard);
  markSessionCardDirtyState(sessionCard);
}

function buildSessionCardUpdatePayload(sessionCard) {
  const sessionId = String(sessionCard?.dataset?.sessionId || "").trim();
  if (!sessionId) {
    throw new Error("Session introuvable.");
  }

  const payload = [];
  for (const row of getSessionCardRows(sessionCard)) {
    const playerId = String(row.dataset.playerId || "").trim();
    const positionId = parsePositiveInt(row.dataset.positionId || row.dataset.basePositionId);
    if (!playerId || positionId == null) {
      throw new Error("Impossible de determiner le joueur ou la position.");
    }
    payload.push({
      sessionId,
      playerId,
      positionId,
      isEliminated: row.dataset.eliminated === "1" ? 1 : 0
    });
  }

  const uniquePositionIds = new Set(payload.map((item) => String(item.positionId)));
  if (uniquePositionIds.size !== payload.length) {
    throw new Error("Chaque joueur doit avoir une position unique.");
  }
  return payload;
}

async function confirmSessionEliminations(sessionCard) {
  if (!(sessionCard instanceof HTMLElement)) return;
  const confirmBtn = sessionCard.querySelector(".sessionConfirmEliminationBtn");
  if (confirmBtn instanceof HTMLButtonElement) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Confirmation...";
  }

  try {
    const updates = buildSessionCardUpdatePayload(sessionCard);
    for (const item of updates) {
      await apiFetch(`/api/entries/${encodeURIComponent(item.sessionId)}/${encodeURIComponent(item.playerId)}`, {
        method: "PUT",
        body: JSON.stringify({
          position_id: item.positionId,
          is_eliminated: item.isEliminated
        })
      });
    }
    setStatus(`Session ${updates[0]?.sessionId || ""} mise a jour`, "ok");
    await loadData();
  } finally {
    if (confirmBtn instanceof HTMLButtonElement) {
      confirmBtn.textContent = "Confirmer les eliminations";
    }
  }
}

function bindSessionCardActions() {
  els.leaderboard.querySelectorAll(".sessionDeleteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await deleteSessionById(btn.dataset.sessionId || "");
      } catch (err) {
        console.error(err);
        setStatus("Suppression impossible", "bad");
      }
    });
  });

  const ongoingCards = [...els.leaderboard.querySelectorAll(".sessionCard[data-session-ongoing='1']")];
  ongoingCards.forEach((sessionCard) => initializeSessionCardEliminationState(sessionCard));

  els.leaderboard.querySelectorAll(".sessionEliminateCheckbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      handleSessionEliminationToggle(checkbox);
    });
  });

  els.leaderboard.querySelectorAll(".sessionConfirmEliminationBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sessionCard = btn.closest(".sessionCard");
      if (!(sessionCard instanceof HTMLElement)) return;
      try {
        await confirmSessionEliminations(sessionCard);
      } catch (err) {
        console.error(err);
        setStatus("Confirmation impossible", "bad");
        alert(String(err?.message || "Impossible de confirmer les eliminations."));
        markSessionCardDirtyState(sessionCard);
      }
    });
  });
}

function renderSessionTablesHTML() {
  const bySession = new Map();
  for (const row of viewRows) {
    const id = String(row.session_numero ?? "").trim();
    const fallbackName = id ? `Session ${id}` : "Session";
    const name = String(row.session_nom ?? fallbackName);
    const key = `${id}::${name}`;
    if (!bySession.has(key)) {
      bySession.set(key, { id, name, rows: [], isOngoing: isSessionOngoingById(id) });
    }
    bySession.get(key).rows.push(row);
  }

  const sessions = [...bySession.values()].sort((a, b) => compareSessionIdsWithOngoingFirst(a.id, b.id));
  if (!sessions.length) return "";

  return `
    <div class="sessionTables">
      ${sessions.map((s) => {
        const rows = [...s.rows].sort((a, b) => Number(a.position) - Number(b.position));
        const statusText = s.isOngoing ? "En cours" : "Validée";
        const statusStyle = s.isOngoing
          ? "background:rgba(241,196,15,.16);border:1px solid rgba(241,196,15,.55);color:#ffe9a6;"
          : "background:rgba(47,181,116,.16);border:1px solid rgba(47,181,116,.55);color:#d7ffe8;";
        const eliminationOrderByPlayerId = new Map(
          rows
            .filter((row) => Number(row.is_eliminated || 0) === 1)
            .sort((a, b) => Number(b.position || 0) - Number(a.position || 0))
            .map((row, idx) => [String(row.joueur_id || "").trim(), idx + 1])
        );
        return `
          <section class="sessionCard" data-session-id="${escapeAttr(s.id)}" data-session-ongoing="${s.isOngoing ? "1" : "0"}">
            <div class="sessionCard__title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span>${escapeHTML(s.name)}</span>
                <span style="padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;${statusStyle}">${statusText}</span>
                ${s.isOngoing ? '<span class="sessionPendingHint">Aucune modification</span>' : ""}
              </span>
              <span style="display:flex;gap:8px;">
                ${s.isOngoing ? '<button class="btn sessionConfirmEliminationBtn" type="button">Confirmer les eliminations</button>' : ""}
                <a class="btn btnLink" href="./add-session.html?editSessionId=${escapeAttr(s.id)}">Modifier</a>
                <button class="btn sessionDeleteBtn" type="button" data-session-id="${escapeAttr(s.id)}">Supprimer</button>
              </span>
            </div>
            <div class="sessionCard__wrap">
              <table class="sessionCard__table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Joueurs</th>
                    <th>Mises</th>
                    <th>Gains</th>
                    ${s.isOngoing ? "<th>Elimine</th>" : ""}
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((r) => {
                    const pos = String(r.position ?? "");
                    const playerId = String(r.joueur_id ?? "").trim();
                    const positionId = String(r.position_id ?? "").trim();
                    const isEliminated = Number(r.is_eliminated || 0) === 1;
                    const elimOrder = eliminationOrderByPlayerId.get(playerId) || null;
                    const posClass = pos === "1" ? "posGold" : (pos === "2" ? "posSilver" : (pos === "3" ? "posBronze" : ""));
                    return `
                      <tr
                        class="${posClass}"
                        data-player-id="${escapeAttr(playerId)}"
                        data-position-id="${escapeAttr(positionId)}"
                        data-base-position-id="${escapeAttr(positionId)}"
                        data-rank="${escapeAttr(pos)}"
                        data-base-rank="${escapeAttr(pos)}"
                        data-eliminated="${isEliminated ? "1" : "0"}"
                        ${elimOrder ? `data-elimination-order="${String(elimOrder)}"` : ""}
                      >
                        <td class="sessionRankCell">${escapeHTML(pos)}</td>
                        <td>${escapeHTML(String(r.joueur ?? ""))}</td>
                        <td>${escapeHTML(String(r.mise ?? ""))} €</td>
                        <td>${escapeHTML(String(r.gain ?? ""))} €</td>
                        ${s.isOngoing ? `
                          <td>
                            <label class="sessionElimToggle">
                              <input class="sessionEliminateCheckbox" type="checkbox" ${isEliminated ? "checked" : ""} />
                              <span>Elimine</span>
                            </label>
                          </td>
                        ` : ""}
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderTableHead() {
  if (isOriginalSheetMode()) {
    const first = sheetLayout.rows[0];
    els.thead.innerHTML = `<tr>${first.cells.map(renderSheetCell).join("")}</tr>`;
    return;
  }

  const { key, dir } = sortState;
  const spreadsheet = isSpreadsheetMode();

  els.thead.innerHTML = `
    <tr>
      ${spreadsheet ? `<th class="rowNumHead"></th>` : ""}
      ${headers.map((h, idx) => {
        const active = key === h;
        const icon = !active ? "⇅" : (dir === "asc" ? "↑" : "↓");
        const label = displayHeaderName(h, idx);
        return `<th ${spreadsheet ? "" : `data-key="${escapeAttr(h)}"`}>
          <span class="sortHint">${escapeHTML(label)} ${spreadsheet ? "" : `<span class="sortIcon">${icon}</span>`}</span>
        </th>`;
      }).join("")}
    </tr>
  `;

  if (spreadsheet) return;
  els.thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => toggleSort(th.dataset.key));
  });
}

function renderTableBody() {
  if (isOriginalSheetMode()) {
    const rows = sheetLayout.rows.slice(1);
    els.tbody.innerHTML = rows.map(r => `<tr>${r.cells.map(renderSheetCell).join("")}</tr>`).join("");
    return;
  }

  const maxRows = 2000;
  const sliced = viewRows.slice(0, maxRows);
  const spreadsheet = isSpreadsheetMode();

  els.tbody.innerHTML = sliced.map((row, rowIdx) => {
    const rowNumber = rowIdx + 1;
    return `
      <tr>
        ${spreadsheet ? `<td class="rowNumCell">${rowNumber}</td>` : ""}
        ${headers.map(h => `<td>${escapeHTML(row[h] ?? "")}</td>`).join("")}
      </tr>
    `;
  }).join("");

  if (viewRows.length > maxRows) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = headers.length + (spreadsheet ? 1 : 0);
    td.textContent = `Affichage limité à ${maxRows} lignes (sur ${viewRows.length}).`;
    tr.appendChild(td);
    els.tbody.appendChild(tr);
  }
}

function renderSheetCell(cell) {
  const tag = cell.tag === "th" ? "th" : "td";
  const attrs = [];
  if (cell.className) attrs.push(`class="${escapeAttr(cell.className)}"`);
  if (cell.id) attrs.push(`id="${escapeAttr(cell.id)}"`);
  if (cell.colspan && cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
  if (cell.rowspan && cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
  const text = escapeHTML(cell.text ?? "").replace(/\n/g, "<br>");
  return `<${tag} ${attrs.join(" ")}>${text}</${tag}>`;
}

function render() {
  const sessionMode = isSessionRows();
  els.dataPanel?.classList.add("isHidden");
  document.body.classList.toggle("sessionMode", sessionMode);

  renderStats();
  renderLeaderboard();
}

function buildColumnSelect() {
  if (!els.columnSelect) return;
  els.columnSelect.innerHTML = `
    <option value="">(Toutes)</option>
    ${headers.map((h, idx) => `<option value="${escapeAttr(h)}">${escapeHTML(displayHeaderName(h, idx))}</option>`).join("")}
  `;
}

async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const savedKey = String(sessionStorage.getItem(ADMIN_KEY_STORAGE) || "").trim();
    const enteredKey = String(headers["x-admin-key"] || savedKey || ADMIN_DEFAULT_KEY || "").trim();
    sessionStorage.setItem(ADMIN_KEY_STORAGE, enteredKey);
    headers["x-admin-key"] = enteredKey;

    const savedCode = String(sessionStorage.getItem(ADMIN_CODE_STORAGE) || "").trim();
    const enteredCode = String(headers["x-admin-code"] || savedCode || window.prompt("Entrez le code admin (4 chiffres) :") || "").trim();
    if (!/^\d{4}$/.test(enteredCode)) {
      throw new Error("Admin confirmation code must be exactly 4 digits");
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

async function fetchSessionRowsFromApi() {
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

  const buyinTotals = new Map();
  const buyinTotalsBySession = new Map();
  for (const b of (buyins || [])) {
    const key = `${b.session_id}|${b.player_id}`;
    buyinTotals.set(key, (buyinTotals.get(key) || 0) + Number(b.amount || 0));
    const sid = String(b.session_id);
    buyinTotalsBySession.set(sid, (buyinTotalsBySession.get(sid) || 0) + Number(b.amount || 0));
  }

  const payoutTotals = new Map();
  const payoutTotalsBySession = new Map();
  for (const p of (payouts || [])) {
    const key = `${p.session_id}|${p.player_id}`;
    payoutTotals.set(key, Number(p.amount || 0));
    const sid = String(p.session_id);
    payoutTotalsBySession.set(sid, (payoutTotalsBySession.get(sid) || 0) + Number(p.amount || 0));
  }

  sessionMetaById = new Map(
    (sessions || []).map((s) => {
      const sid = String(s.session_id);
      const isClosed = Number(s.is_closed || 0) === 1;
      const buyinTotal = Number(buyinTotalsBySession.get(sid) || 0);
      const payoutTotal = Number(payoutTotalsBySession.get(sid) || 0);
      const hasAssignedGains = payoutTotal > 0;
      const payoutsBalanced = Math.abs(payoutTotal - buyinTotal) < 0.01;
      const isOngoing = !isClosed || !hasAssignedGains || !payoutsBalanced;
      return [sid, {
        id: sid,
        name: String(s.session_name || `Session ${sid}`),
        is_closed: isClosed,
        is_ongoing: isOngoing,
        buyin_total: buyinTotal,
        payout_total: payoutTotal
      }];
    })
  );
  ongoingSessionIds = new Set(
    [...sessionMetaById.entries()]
      .filter(([, meta]) => Boolean(meta?.is_ongoing))
      .map(([sid]) => sid)
  );

  const rows = (entries || []).map((e) => {
    const sid = String(e.session_id);
    const pid = String(e.player_id);
    const key = `${sid}|${pid}`;
    const buyin = Number(buyinTotals.get(key) || 0);
    const gain = Number(payoutTotals.get(key) || 0);
    const session = sessionMetaById.get(sid);
    return {
      session_numero: sid,
      session_nom: String(session?.name || `Session ${sid}`),
      joueur_id: pid,
      joueur: String(e.player_name || playerNameById[pid] || pid),
      position_id: String(e.position_id ?? ""),
      position: String(e.rank_no ?? ""),
      is_eliminated: Number(e.is_eliminated || 0) ? "1" : "0",
      mise_id: String(buyin / 10 || ""),
      mise: String(buyin),
      gain: String(gain),
      session_is_ongoing: session?.is_ongoing ? "1" : "0"
    };
  });

  rows.sort((a, b) => {
    const s = Number(a.session_numero) - Number(b.session_numero);
    if (s !== 0) return s;
    return Number(a.position) - Number(b.position);
  });

  return {
    headers: ["session_numero", "session_nom", "joueur_id", "joueur", "position_id", "position", "is_eliminated", "mise_id", "mise", "gain"],
    rows
  };
}

async function deleteSessionById(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  if (!window.confirm(`Supprimer la session ${sid} ?`)) return;
  await apiFetch(`/api/sessions/${encodeURIComponent(sid)}`, { method: "DELETE" });
  if (els.sessionSelect && String(els.sessionSelect.value || "") === sid) {
    els.sessionSelect.value = "";
  }
  await loadData();
}

async function loadData(forceDatasetId = null) {
  setStatus("Chargement…", "warn");
  try {
    if (forceDatasetId) activeDatasetId = forceDatasetId;
    activeDatasetId = "sessions";
    importedDatasetName = "";
    sheetLayout = null;

    const obj = await fetchSessionRowsFromApi();
    headers = obj.headers;
    rawRows = obj.rows;
    if (!headers.length) throw new Error("Dataset vide depuis API");

    sortState = { key: headers[0] ?? null, dir: "asc" };

    buildColumnSelect();
    buildSessionSelect();
    els.table.classList.toggle("sheetMode", Boolean(isOriginalSheetMode()));
    renderTableHead();

    viewRows = [...rawRows];
    applySort();
    render();

  } catch (e) {
    console.error(e);
    setStatus("Erreur de chargement API", "bad");
    els.statsCards.innerHTML = `
      <div class="card">
        <div class="card__k">Problème</div>
        <div class="card__v" style="font-size:14px;font-weight:600;">
          Impossible de charger les donnees depuis l'API backend.
          <div style="margin-top:8px;font-size:12px;opacity:.85;">${escapeHTML(String(e?.message || ""))}</div>
        </div>
      </div>
    `;
    els.thead.innerHTML = "";
    els.tbody.innerHTML = "";
    els.sessionField?.classList.add("isHidden");
    els.table.classList.remove("sheetMode");
    document.getElementById("rowCount").textContent = "0 lignes";
    document.getElementById("colCount").textContent = "0 colonnes";
  }
}

function ensureSheetStyles(styleMap) {
  const styleId = "sheetStyleMap";
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  const rules = Object.entries(styleMap || {}).map(([cls, css]) => (
    `#dataTable.sheetMode .${cls}{${css}}`
  ));
  styleEl.textContent = rules.join("\n");
}

function exportCurrentDataset() {
  if (!headers.length) return;
  const payload = {
    columns: headers,
    rows: rawRows
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const base = importedDatasetName || activeDatasetId || "dataset";
  const fileName = `${base}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function datasetFromJson(json) {
  if (Array.isArray(json?.session)) {
    const jsonRows = json.session;
    const jsonHeaders = jsonRows.length ? Object.keys(jsonRows[0]) : [];
    return {
      headers: jsonHeaders,
      rows: jsonRows.map((row) => {
        const clean = {};
        jsonHeaders.forEach((h) => { clean[h] = String(row[h] ?? "").trim(); });
        return clean;
      })
    };
  }

  if (Array.isArray(json)) {
    const jsonRows = json;
    const jsonHeaders = jsonRows.length ? Object.keys(jsonRows[0]) : [];
    return {
      headers: jsonHeaders,
      rows: jsonRows.map((row) => {
        const clean = {};
        jsonHeaders.forEach((h) => { clean[h] = String(row[h] ?? "").trim(); });
        return clean;
      })
    };
  }

  const jsonRows = Array.isArray(json?.rows) ? json.rows : [];
  const jsonHeaders = jsonRows.length
    ? Object.keys(jsonRows[0])
    : (Array.isArray(json?.columns) ? json.columns : []);

  return {
    headers: jsonHeaders,
    rows: jsonRows.map((row) => {
      const clean = {};
      jsonHeaders.forEach((h) => { clean[h] = String(row[h] ?? "").trim(); });
      return clean;
    })
  };
}

async function importDatasetFromFile(file) {
  const text = await file.text();
  const json = JSON.parse(text);
  const obj = await datasetFromJson(json);
  if (!obj.headers.length) throw new Error("Fichier JSON sans données exploitables");

  importedDatasetName = String(file.name || "import")
    .replace(/\.json$/i, "")
    .replace(/[^\w.-]+/g, "_");
  activeDatasetId = "";
  sheetLayout = null;
  headers = obj.headers;
  rawRows = obj.rows;
  sortState = { key: headers[0] ?? null, dir: "asc" };

  buildColumnSelect();
  els.table.classList.remove("sheetMode");
  renderTableHead();

  viewRows = [...rawRows];
  applySort();
  render();
  setStatus(`Importé (${file.name})`, "ok");
}

if (els.searchInput) els.searchInput.addEventListener("input", applyFilters);
if (els.sessionSelect) els.sessionSelect.addEventListener("change", applyFilters);
if (els.datasetSelect) {
  els.datasetSelect.addEventListener("change", () => {
    loadData(els.datasetSelect.value);
  });
}
if (els.columnSelect) els.columnSelect.addEventListener("change", applyFilters);
if (els.columnFilterInput) els.columnFilterInput.addEventListener("input", applyFilters);
if (els.refreshBtn) els.refreshBtn.addEventListener("click", loadData);
if (els.importBtn && els.importInput) {
  els.importBtn.addEventListener("click", () => els.importInput.click());
}
if (els.exportBtn) els.exportBtn.addEventListener("click", exportCurrentDataset);
if (els.importInput) {
  els.importInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importDatasetFromFile(file);
    } catch (err) {
      console.error(err);
      setStatus("Import JSON invalide", "bad");
    } finally {
      e.target.value = "";
    }
  });
}

loadData();
