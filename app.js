const state = {
  mode: "off",
  disturbanceEnabled: false,
  boxes: [
    { slot: 1, online: true,  params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } },
    { slot: 2, online: true,  params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } },
    { slot: 3, online: false, params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } },
    { slot: 4, online: true,  params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } }
  ],
  allDraft: { G: 8, K: 1, L: 3, W: 50 }
};

document.addEventListener("DOMContentLoaded", () => {
  setupModeButtons();
  renderBoxTable();
});

function setupModeButtons() {
  const buttons = document.querySelectorAll(".mode-button");
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      state.mode = button.dataset.mode;
    });
  });
}

function toggleDisturbance() {
  state.disturbanceEnabled = !state.disturbanceEnabled;

  const status = document.getElementById("disturbanceStatus");
  const button = document.getElementById("disturbanceButton");

  if (state.disturbanceEnabled) {
    status.textContent = "Ein";
    button.textContent = "Deaktivieren";
  } else {
    status.textContent = "Aus";
    button.textContent = "Aktivieren";
  }
}

function mockScan() {
  const text = document.getElementById("scanStatusText");
  const dot = document.getElementById("scanStatusDot");

  text.textContent = "Scan läuft ...";
  if (dot) {
    dot.classList.remove("green");
    dot.classList.add("yellow");
  }

  setTimeout(() => {
    text.textContent = "3 Box-Module gefunden";
    if (dot) {
      dot.classList.remove("yellow");
      dot.classList.add("green");
    }
    renderBoxTable();
  }, 1200);
}

function renderBoxTable() {
  const tbody = document.getElementById("boxTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  tbody.appendChild(createAllRow());

  state.boxes
    .filter(box => box.online)
    .forEach(box => {
      tbody.appendChild(createBoxRow(box));
    });
}

function createAllRow() {
  const row = document.createElement("tr");

  row.innerHTML = `
    <td><button class="send-button send-all">Alle</button></td>
    <td>${createSelect("all", "G", state.allDraft.G, 1, 20)}</td>
    <td>${createSelect("all", "K", state.allDraft.K, 1, 10)}</td>
    <td>${createSelect("all", "L", state.allDraft.L, 1, 10)}</td>
    <td>${createSelect("all", "W", state.allDraft.W, 0, 90, 10)}</td>
  `;

  row.querySelector(".send-button").addEventListener("click", () => {
    state.boxes.forEach(box => {
      if (!box.online) return;
      box.draft = { ...state.allDraft };
      box.params = { ...state.allDraft };
    });
    renderBoxTable();
  });

  attachSelectEvents(row, "all");
  return row;
}

function createBoxRow(box) {
  const row = document.createElement("tr");
  const draft = box.draft;
  const live = box.params;

  row.innerHTML = `
    <td><button class="send-button send-slot-${box.slot}">Box ${box.slot}</button></td>
    <td>${createSelect(box.slot, "G", draft.G, 1, 20, 1, draft.G !== live.G)}</td>
    <td>${createSelect(box.slot, "K", draft.K, 1, 10, 1, draft.K !== live.K)}</td>
    <td>${createSelect(box.slot, "L", draft.L, 1, 10, 1, draft.L !== live.L)}</td>
    <td>${createSelect(box.slot, "W", draft.W, 0, 90, 10, draft.W !== live.W)}</td>
  `;

  row.querySelector(".send-button").addEventListener("click", () => {
    box.params = { ...box.draft };
    renderBoxTable();
  });

  attachSelectEvents(row, box.slot);
  return row;
}

function createSelect(slot, key, selectedValue, min, max, step = 1, isDraft = false) {
  let options = "";

  for (let value = min; value <= max; value += step) {
    options += `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${value}</option>`;
  }

  return `
    <select class="value-button ${isDraft ? "draft" : ""}" data-slot="${slot}" data-key="${key}">
      ${options}
    </select>
  `;
}

function attachSelectEvents(row, slot) {
  row.querySelectorAll("select").forEach(select => {
    select.addEventListener("change", event => {
      const key = event.target.dataset.key;
      const value = Number(event.target.value);

      if (slot === "all") {
        state.allDraft[key] = value;
        enforceKLessThanL(state.allDraft);
      } else {
        const box = state.boxes.find(b => b.slot === Number(slot));
        if (!box) return;
        box.draft[key] = value;
        enforceKLessThanL(box.draft);
      }

      renderBoxTable();
    });
  });
}

function enforceKLessThanL(obj) {
  if (obj.K >= obj.L) {
    obj.L = Math.min(10, obj.K + 1);
  }
  if (obj.L <= obj.K) {
    obj.K = Math.max(1, obj.L - 1);
  }
}
