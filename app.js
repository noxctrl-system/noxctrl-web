let nosModules = [];
const APP_VERSION = "v0.3-nos-box-layout";

const NOS_BLE = {
  name: "Nos-Control",
  serviceUuid: "12345678-1234-1234-1234-1234567890ab",
  ctrlUuid: "12345678-1234-1234-1234-1234567890ac",
  statUuid: "12345678-1234-1234-1234-1234567890ad"
};

const state = {
  mode: "off",

  delayedStart: {
    drivers: 12,
    laps: 5
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
    setScanStatus("Web Bluetooth nicht unterstützt", "yellow");
    return false;
  }

  try {
    setScanStatus("Nos-Modul auswählen ...", "yellow");

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: NOS_BLE.name }],
      optionalServices: [NOS_BLE.serviceUuid]
    });

    const alreadyConnected = nosModules.some(m => m.device.id === device.id);

    if (alreadyConnected) {
      setScanStatus("Dieses Nos-Modul ist bereits verbunden", "green");
      return true;
    }

    device.addEventListener("gattserverdisconnected", () => {
      handleNosDisconnected(device.id);
    });

    setScanStatus("Verbinde mit Nos-Modul ...", "yellow");

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NOS_BLE.serviceUuid);
    const ctrlChar = await service.getCharacteristic(NOS_BLE.ctrlUuid);
    const statChar = await service.getCharacteristic(NOS_BLE.statUuid);

    const module = {
      id: device.id,
      name: device.name || "Nos-Control",
      device,
      server,
      service,
      ctrlChar,
      statChar,
      lastStatus: ""
    };

    nosModules.push(module);

    renderNosModuleList();
    setScanStatus(`${nosModules.length} Nos-Modul(e) verbunden`, "green");
    
    console.log("NOS MODULES:", nosModules.map(m => ({
      id: m.id,
      name: m.name,
      connected: m.device?.gatt?.connected
    })));
    
    
    
    await setupNosNotifications(module);

    setScanStatus(`${nosModules.length} Nos-Modul(e) verbunden`, "green");
    renderNosModuleList();
    
    await sendToNosModule(module, "STATUS");

    return true;
  } catch (error) {
    console.error("BLE Verbindung fehlgeschlagen:", error);
    setScanStatus("Verbindung fehlgeschlagen", "yellow");
    return false;
  }
}

async function setupNosNotifications(module) {
  if (!module?.statChar) return;

  try {
    await module.statChar.startNotifications();

    module.statChar.addEventListener("characteristicvaluechanged", event => {
      const value = event.target.value;
      const text = new TextDecoder().decode(value);

      module.lastStatus = text;

      console.log(`NOS STATUS [${module.name}]:`, text);
      setScanStatus(`${nosModules.length} Nos-Modul(e) verbunden`, "green");
    });
  } catch (error) {
    console.warn("Nos Notifications konnten nicht aktiviert werden:", error);
  }
}

function handleNosDisconnected(deviceId) {
  console.log("Nos-Modul getrennt:", deviceId);

  nosModules = nosModules.filter(m => m.id !== deviceId);

  renderNosModuleList();

  if (nosModules.length > 0) {
    setScanStatus(`${nosModules.length} Nos-Modul(e) verbunden`, "green");
  } else {
    setScanStatus("Keine Nos-Module verbunden", "yellow");
  }
}

function setScanStatus(text, color) {
  const statusText = document.getElementById("scanStatusText");
  const dot = document.getElementById("scanStatusDot");

  if (statusText) statusText.textContent = text;

  if (dot) {
    dot.classList.remove("green", "yellow");
    dot.classList.add(color);
  }
}

function renderNosModuleList() {
  const list = document.getElementById("nosModuleList");
  if (!list) return;

  if (nosModules.length === 0) {
    list.textContent = "Keine Nos-Module verbunden.";
    return;
  }

  list.innerHTML = nosModules
    .map((module, index) => {
      const connected = module.device?.gatt?.connected ? "verbunden" : "getrennt";
      const shortId = module.id ? module.id.slice(-6) : "?";
      return `Nos ${index + 1}: ${module.name} · ${connected} · ${shortId}`;
    })
    .join("<br>");
}

async function sendToNosModule(module, command) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(command);

    await module.ctrlChar.writeValue(data);

    console.log(`BLE SEND [${module.name}]:`, command);
    return true;
  } catch (error) {
    console.error(`Senden fehlgeschlagen [${module.name}]:`, error);
    return false;
  }
}
async function sendBleCommand(command) {
  if (nosModules.length === 0) {
    const connected = await connectNosModule();
    if (!connected) return;
  }

  console.log("SEND TO MODULE COUNT:", nosModules.length);

  let successCount = 0;

  for (const module of [...nosModules]) {
    console.log("TRY SEND:", module.name, module.id, module.device?.gatt?.connected);

    if (!module.device?.gatt?.connected) {
      console.warn("Überspringe getrenntes Modul:", module.name);
      continue;
    }

    const ok = await sendToNosModule(module, command);
    if (ok) successCount += 1;

    await sleep(80);
  }

  renderNosModuleList();

  if (successCount > 0) {
    setScanStatus(`Gesendet an ${successCount} Nos-Modul(e): ${command}`, "green");
  } else {
    setScanStatus("Senden fehlgeschlagen", "yellow");
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  setupNosConnectButton();
  renderDelayedStartUI();
  renderBoxTable();

  const v = document.getElementById("appVersion");
  if (v) v.textContent = APP_VERSION;
});

function setupNosConnectButton() {
  const button = document.getElementById("connectNosButton");

  if (!button) return;

  button.addEventListener("click", async () => {
    await connectNosModule();
  });
}

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
