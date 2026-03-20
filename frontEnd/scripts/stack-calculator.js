const CHIP_CONFIG = [
  { key: "orange", label: "orange", defaultValue: 50 },
  { key: "black", label: "noir", defaultValue: 100 },
  { key: "green", label: "vert", defaultValue: 500 },
  { key: "yellow", label: "jaune", defaultValue: 1000 },
  { key: "red", label: "rouge", defaultValue: 5000 },
  { key: "white", label: "blanc", defaultValue: 10000 }
];

const els = {
  playerNameInput: document.getElementById("playerNameInput"),
  blindAmountInput: document.getElementById("blindAmountInput"),
  resetBtn: document.getElementById("resetBtn"),
  stackTotalCell: document.getElementById("stackTotalCell"),
  stackTotalValue: document.getElementById("stackTotalValue"),
  blindsExactValue: document.getElementById("blindsExactValue"),
  blindsFullValue: document.getElementById("blindsFullValue"),
  formulaLine: document.getElementById("formulaLine")
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
  if (n == null) return 0;
  if (n <= 0) return 0;
  if (!integer) return n;
  return Math.floor(n);
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

function applyDefaults() {
  for (const chip of chipRefs) {
    if (chip.valueInput instanceof HTMLInputElement) {
      chip.valueInput.value = String(chip.defaultValue);
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

function updateCalculations() {
  const pieces = [];
  let totalStack = 0;

  for (const chip of chipRefs) {
    const chipValue = readNonNegativeNumber(chip.valueInput);
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

  const playerName = String(els.playerNameInput?.value || "").trim();
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

  if (!els.formulaLine) return;
  if (!pieces.length) {
    els.formulaLine.textContent = `${playerPrefix}Saisis les jetons du joueur pour calculer son stack actuel.`;
    return;
  }
  const baseFormula = `${pieces.join(" + ")} = ${formatNumber(totalStack, 0)}`;
  if (blind <= 0) {
    els.formulaLine.textContent = `${playerPrefix}${baseFormula} | Saisis la blinde pour calculer les blindes restantes.`;
    return;
  }
  els.formulaLine.textContent = `${playerPrefix}${baseFormula} | ${formatNumber(totalStack, 0)} / ${formatNumber(blind, 0)} = ${formatTrimmed(blindsExact, 2)} blindes`;
}

function bindEvents() {
  for (const chip of chipRefs) {
    chip.valueInput?.addEventListener("input", updateCalculations);
    chip.countInput?.addEventListener("input", updateCalculations);
  }
  els.playerNameInput?.addEventListener("input", updateCalculations);
  els.blindAmountInput?.addEventListener("input", updateCalculations);
  els.resetBtn?.addEventListener("click", () => {
    applyDefaults();
    updateCalculations();
  });
}

applyDefaults();
bindEvents();
updateCalculations();
