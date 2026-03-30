let nosDevice = null;
let nosServer = null;
let nosService = null;
let nosCtrlChar = null;
let nosStatChar = null;

const NOS_BLE = {
  name: "Nos-Control",
  serviceUuid: "12345678-1234-1234-1234-1234567890ab",
  ctrlUuid: "12345678-1234-1234-1234-1234567890ac",
  statUuid: "12345678-1234-1234-1234-1234567890ad"
};

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

async function connectNosModule() {
  if (!navigator.bluetooth) {
    alert("Web Bluetooth wird auf diesem Gerät oder Browser nicht unterstützt.");
    return false;
  }

  try {
    nosDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { name: NOS_BLE.name }
      ],
      optionalServices: [NOS_BLE.serviceUuid]
    });

    nosServer = await nosDevice.gatt.connect();
    nosService = await nosServer.getPrimaryService(NOS_BLE.serviceUuid);
    nosCtrlChar = await nosService.getCharacteristic(NOS_BLE.ctrlUuid);
    nosStatChar = await nosService.getCharacteristic(NOS_BLE.statUuid);

    console.log("BLE verbunden mit:", nosDevice.name);
    alert(`Verbunden mit ${nosDevice.name}`);
    return true;
  } catch (error) {
    console.error("BLE Verbindung fehlgeschlagen:", error);
    alert("BLE Verbindung fehlgeschlagen. Details in der Konsole.");
    return false;
  }
}

async function sendBleCommand(command) {
  if (!nosCtrlChar) {
    const connected = await connectNosModule();
    if (!connected) return;
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(command);
    await nosCtrlChar.writeValue(data);
    console.log("BLE SEND:", command);
  } catch (error) {
    console.error("Senden fehlgeschlagen:", error);
    alert("Senden fehlgeschlagen. Details in der Konsole.");
  }
}

async function sendCommand(command) {
  console.log("SEND:", command);
  await sendBleCommand(command);
}

async function commandNosOff() {
  await sendCommand("PASS=OFF");
  await sendCommand("RESET");
  await sendCommand("MODE=IDLE");
  await sendCommand("STATUS");
}

async function commandNosRun() {
  await sendCommand("PASS=OFF");
  await sendCommand("MODE=RUN");
}

async function commandNosDelayedStart(drivers, laps) {
  await sendCommand(`DSTART=${drivers},${laps}`);
}

async function commandDisturbanceOn() {
  await sendCommand("MODE=IDLE");
}

async function commandDisturbanceOff() {
  await sendCommand("MODE=RUN");
}

async function commandSendBoxConfig(slot, params) {
  await sendCommand(`BOX${slot}: CFG=${params.G},${params.K},${params.L},${params.W}`);
  await sendCommand(`BOX${slot}: STATUS`);
}

async function commandSendAllBoxes(params) {
  await sendCommand(`ALL BOXES: CFG=${params.G},${params.K},${params.L},${params.W}`);
  await sendCommand("ALL BOXES: STATUS");
}

async function commandSearchAndRead() {
  const connected = await connectNosModule();
  if (!connected) return;

  await sendCommand("STATUS");
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
    button.addEventListener("click", async (event) => {
      const mode = button.dataset.mode;

      if (mode === "delayed") {
        event.preventDefault();
        return;
      }

      buttons.forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      state.mode = mode;

      if (mode === "off") {
        await commandNosOff();
      }
      
      if (mode === "run") {
        await commandNosRun();
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
    confirmButton.addEventListener("click", async () => {
      const drivers = state.delayedStart.drivers;
      const laps = state.delayedStart.laps;
  
      await commandNosDelayedStart(drivers, laps);
  
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

async function mockScan() {
  await commandSearchAndRead();
  
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

  row.querySelector(".send-button").addEventListener("click", async () => {
    await commandSendAllBoxes(state.allDraft);
  
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

  row.querySelector(".send-button").addEventListener("click", async () => {
    await commandSendBoxConfig(box.slot, box.draft);
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
