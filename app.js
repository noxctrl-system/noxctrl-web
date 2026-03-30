const state = {
  mode: "off",
  disturbanceEnabled: false,

  delayedStart: {
    drivers: 12,
    laps: 5
  },

  disturbanceConfig: {
    enabled: false,
    probability: 40,
    minutes: 10,
    durationMin: 20,
    durationMax: 60
  },

  boxes: [
    { slot: 1, online: true,  params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } },
    { slot: 2, online: true,  params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } },
    { slot: 3, online: false, params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } },
    { slot: 4, online: true,  params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 } }
  ],
  allDraft: { G: 8, K: 1, L: 3, W: 50 }
};

function sendCommand(command) {
  console.log("SEND:", command);
  alert(command); // 👈 TEMPORÄR
}

function commandNosOff() {
  sendCommand("PASS=OFF");
  sendCommand("RESET");
  sendCommand("MODE=IDLE");
  sendCommand("STATUS");
}

function commandNosRun() {
  sendCommand("PASS=OFF");
  sendCommand("MODE=RUN");
}

function commandNosDelayedStart(drivers, laps) {
  sendCommand(`DSTART=${drivers},${laps}`);
}

function commandDisturbanceOn() {
  sendCommand("MODE=IDLE");
}

function commandDisturbanceOff() {
  sendCommand("MODE=RUN");
}

function commandSearchAndRead() {
  console.log("SCAN + STATUS anfordern");
}

function commandSendBoxConfig(slot, params) {
  sendCommand(`BOX${slot}: CFG=${params.G},${params.K},${params.L},${params.W}`);
  sendCommand(`BOX${slot}: STATUS`);
}

function commandSendAllBoxes(params) {
  sendCommand(`ALL BOXES: CFG=${params.G},${params.K},${params.L},${params.W}`);
  sendCommand("ALL BOXES: STATUS");
}

document.addEventListener("DOMContentLoaded", () => {
  setupModeButtons();
  setupDelayedStartModal();
  setupDisturbanceModal();
  renderDelayedStartUI();
  renderDisturbanceUI();
  renderBoxTable();
});

function setupModeButtons() {
  const buttons = document.querySelectorAll(".mode-button");

  buttons.forEach(button => {
    button.addEventListener("click", (event) => {
      const mode = button.dataset.mode;

      if (mode === "delayed") {
        event.preventDefault();
        return;
      }

      buttons.forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      state.mode = mode;

      if (mode === "off") {
        commandNosOff();
      }

      if (mode === "run") {
        commandNosRun();
      }
    });
  });
}

function setupDelayedStartModal() {
  const openButton = document.getElementById("openDelayedStartButton");
  const closeButton = document.getElementById("closeDelayedStartButton");
  const modal = document.getElementById("delayedStartModal");
  const driversRange = document.getElementById("driversRange");
  const driversValue = document.getElementById("driversValue");
  const lapsMinus = document.getElementById("lapsMinusButton");
  const lapsPlus = document.getElementById("lapsPlusButton");
  const confirmButton = document.getElementById("delayedStartConfirmButton");

  if (openButton) {
    openButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDelayedStartModal();
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeDelayedStartModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeDelayedStartModal();
      }
    });
  }

  if (driversRange) {
    driversRange.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state.delayedStart.drivers = value;
    
      if (driversValue) {
        driversValue.textContent = value;
      }
    
      renderDelayedStartUI();
    });
  }

  if (lapsMinus) {
    lapsMinus.addEventListener("click", () => {
      state.delayedStart.laps = Math.max(1, state.delayedStart.laps - 1);
      renderDelayedStartUI();
    });
  }

  if (lapsPlus) {
    lapsPlus.addEventListener("click", () => {
      state.delayedStart.laps = Math.min(20, state.delayedStart.laps + 1);
      renderDelayedStartUI();
    });
  }

  if (confirmButton) {
    confirmButton.addEventListener("click", () => {
      const drivers = state.delayedStart.drivers;
      const laps = state.delayedStart.laps;
  
      commandNosDelayedStart(drivers, laps);
  
      const buttons = document.querySelectorAll(".mode-button");
      buttons.forEach(b => b.classList.remove("active"));
  
      const delayedButton = document.getElementById("openDelayedStartButton");
      if (delayedButton) delayedButton.classList.add("active");
  
      state.mode = "delayed";
      closeDelayedStartModal();
    });
  }
}

function openDelayedStartModal() {
  const modal = document.getElementById("delayedStartModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderDelayedStartUI();
}

function closeDelayedStartModal() {
  const modal = document.getElementById("delayedStartModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderDelayedStartUI() {
  const driversRange = document.getElementById("driversRange");
  const driversValue = document.getElementById("driversValue");
  const lapsValue = document.getElementById("lapsValue");
  const targetPassesValue = document.getElementById("targetPassesValue");

  if (driversRange) driversRange.value = state.delayedStart.drivers;
  if (driversValue) driversValue.textContent = state.delayedStart.drivers;
  if (lapsValue) lapsValue.textContent = state.delayedStart.laps;
  if (targetPassesValue) {
    targetPassesValue.textContent = state.delayedStart.drivers * state.delayedStart.laps;
  }
}

function setupDisturbanceModal() {
  const openButton = document.getElementById("disturbanceButton");
  const closeButton = document.getElementById("closeDisturbanceButton");
  const modal = document.getElementById("disturbanceModal");

  const enabledOff = document.getElementById("distEnabledOff");
  const enabledOn = document.getElementById("distEnabledOn");

  const probabilityRange = document.getElementById("distProbabilityRange");

  const minutesMinus = document.getElementById("distMinutesMinus");
  const minutesPlus = document.getElementById("distMinutesPlus");

  const minMinus = document.getElementById("distMinMinus");
  const minPlus = document.getElementById("distMinPlus");

  const maxMinus = document.getElementById("distMaxMinus");
  const maxPlus = document.getElementById("distMaxPlus");

  const confirmButton = document.getElementById("disturbanceConfirmButton");

  if (openButton) {
    openButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDisturbanceModal();
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeDisturbanceModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeDisturbanceModal();
      }
    });
  }

  if (enabledOff) {
    enabledOff.addEventListener("click", () => {
      state.disturbanceConfig.enabled = false;
      renderDisturbanceUI();
    });
  }

  if (enabledOn) {
    enabledOn.addEventListener("click", () => {
      state.disturbanceConfig.enabled = true;
      renderDisturbanceUI();
    });
  }

  if (probabilityRange) {
    probabilityRange.addEventListener("input", (event) => {
      state.disturbanceConfig.probability = Number(event.target.value);
      renderDisturbanceUI();
    });
  }

  if (minutesMinus) {
    minutesMinus.addEventListener("click", () => {
      state.disturbanceConfig.minutes = Math.max(1, state.disturbanceConfig.minutes - 1);
      renderDisturbanceUI();
    });
  }

  if (minutesPlus) {
    minutesPlus.addEventListener("click", () => {
      state.disturbanceConfig.minutes = Math.min(30, state.disturbanceConfig.minutes + 1);
      renderDisturbanceUI();
    });
  }

  if (minMinus) {
    minMinus.addEventListener("click", () => {
      state.disturbanceConfig.durationMin = Math.max(5, state.disturbanceConfig.durationMin - 5);
      enforceDisturbanceMinMax();
      renderDisturbanceUI();
    });
  }

  if (minPlus) {
    minPlus.addEventListener("click", () => {
      state.disturbanceConfig.durationMin = Math.min(120, state.disturbanceConfig.durationMin + 5);
      enforceDisturbanceMinMax();
      renderDisturbanceUI();
    });
  }

  if (maxMinus) {
    maxMinus.addEventListener("click", () => {
      state.disturbanceConfig.durationMax = Math.max(5, state.disturbanceConfig.durationMax - 5);
      enforceDisturbanceMinMax();
      renderDisturbanceUI();
    });
  }

  if (maxPlus) {
    maxPlus.addEventListener("click", () => {
      state.disturbanceConfig.durationMax = Math.min(120, state.disturbanceConfig.durationMax + 5);
      enforceDisturbanceMinMax();
      renderDisturbanceUI();
    });
  }

  if (confirmButton) {
    confirmButton.addEventListener("click", () => {
      const cfg = state.disturbanceConfig;
      console.log(
        `DISTCFG=${cfg.enabled ? 1 : 0},${cfg.probability},${cfg.minutes},${cfg.durationMin},${cfg.durationMax}`
      );

      state.disturbanceEnabled = cfg.enabled;
      updateDisturbanceCardStatus();
      closeDisturbanceModal();
    });
  }
}

function openDisturbanceModal() {
  const modal = document.getElementById("disturbanceModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderDisturbanceUI();
}

function closeDisturbanceModal() {
  const modal = document.getElementById("disturbanceModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function enforceDisturbanceMinMax() {
  if (state.disturbanceConfig.durationMin > state.disturbanceConfig.durationMax) {
    state.disturbanceConfig.durationMax = state.disturbanceConfig.durationMin;
  }

  if (state.disturbanceConfig.durationMax < state.disturbanceConfig.durationMin) {
    state.disturbanceConfig.durationMin = state.disturbanceConfig.durationMax;
  }
}

function renderDisturbanceUI() {
  const cfg = state.disturbanceConfig;

  const enabledOff = document.getElementById("distEnabledOff");
  const enabledOn = document.getElementById("distEnabledOn");

  const probabilityRange = document.getElementById("distProbabilityRange");
  const probabilityValue = document.getElementById("distProbabilityValue");

  const minutesValue = document.getElementById("distMinutesValue");
  const minValue = document.getElementById("distMinValue");
  const maxValue = document.getElementById("distMaxValue");

  const preview = document.getElementById("distConfigPreview");

  if (enabledOff) enabledOff.classList.toggle("active", !cfg.enabled);
  if (enabledOn) enabledOn.classList.toggle("active", cfg.enabled);

  if (probabilityRange) probabilityRange.value = cfg.probability;
  if (probabilityValue) probabilityValue.textContent = cfg.probability;

  if (minutesValue) minutesValue.textContent = cfg.minutes;
  if (minValue) minValue.textContent = cfg.durationMin;
  if (maxValue) maxValue.textContent = cfg.durationMax;

  if (preview) {
    preview.textContent =
      `DISTCFG=${cfg.enabled ? 1 : 0},${cfg.probability},${cfg.minutes},${cfg.durationMin},${cfg.durationMax}`;
  }

  updateDisturbanceCardStatus();
}

function updateDisturbanceCardStatus() {
  const status = document.getElementById("disturbanceStatus");
  const button = document.getElementById("disturbanceButton");

  if (status) {
    status.textContent = state.disturbanceConfig.enabled ? "Ein" : "Aus";
  }

  if (button) {
    button.textContent = "Konfigurieren";
  }
}

function mockScan() {
  commandSearchAndRead();
  
  const text = document.getElementById("scanStatusText");
  const dot = document.getElementById("scanStatusDot");

  if (text) text.textContent = "Scan läuft ...";

  if (dot) {
    dot.classList.remove("green");
    dot.classList.add("yellow");
  }

  setTimeout(() => {
    if (text) text.textContent = "3 Box-Module gefunden";

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
    commandSendAllBoxes(state.allDraft);
  
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
    commandSendBoxConfig(box.slot, box.draft);
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

function setupDisturbanceModal() {
  const openButton = document.getElementById("disturbanceButton");
  const closeButton = document.getElementById("closeDisturbanceButton");
  const modal = document.getElementById("disturbanceModal");

  if (openButton) {
    openButton.addEventListener("click", () => {
      openDisturbanceModal();
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeDisturbanceModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeDisturbanceModal();
      }
    });
  }
}

function openDisturbanceModal() {
  const modal = document.getElementById("disturbanceModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeDisturbanceModal() {
  const modal = document.getElementById("disturbanceModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}
