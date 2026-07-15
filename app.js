let nosModules = [];
let boxModules = [];
const APP_VERSION = "v1.2 : BoxSettings";
const CHAMPIONS_HISTORY_KEY = "champions.history.v1";

const RECONNECT_DELAY = 2000;

const NOS_BLE = {
  name: "Nos-Control",
  serviceUuid: "12345678-1234-1234-1234-1234567890ab",
  ctrlUuid: "12345678-1234-1234-1234-1234567890ac",
  statUuid: "12345678-1234-1234-1234-1234567890ad"
};

const BOX_BLE = {
  name: "Box-Control",
  serviceUuid: "7d8c3a10-2f6a-4b8e-9e10-1f0b2f6a0001",
  ctrlUuid: "7d8c3a10-2f6a-4b8e-9e10-1f0b2f6a0002",
  statUuid: "7d8c3a10-2f6a-4b8e-9e10-1f0b2f6a0003"
};

const state = {
  mode: "off",

  runMode: {
    mode: "LEGACY",
    baseSec: 3,
    catchupC: 8
  },

  delayedStart: {
    drivers: 3,
    laps: 5
  },
  
  boxes: [
    { slot: 1, online: false, name: "BOX", params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 }, detection: { preset: 1, distance: 7 }, detectionDraft: { preset: 1, distance: 7 } },
    { slot: 2, online: false, name: "BOX", params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 }, detection: { preset: 1, distance: 7 }, detectionDraft: { preset: 1, distance: 7 } },
    { slot: 3, online: false, name: "BOX", params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 }, detection: { preset: 1, distance: 7 }, detectionDraft: { preset: 1, distance: 7 } },
    { slot: 4, online: false, name: "BOX", params: { G: 8, K: 1, L: 3, W: 50 }, draft: { G: 8, K: 1, L: 3, W: 50 }, detection: { preset: 1, distance: 7 }, detectionDraft: { preset: 1, distance: 7 } }
  ],

  allDraft: { G: 8, K: 1, L: 3, W: 50 },
  allDetectionDraft: { preset: 1, distance: 7 },

  champions: {
    orderedSlots: [],
    proposedChanges: [],
    sending: false
  }
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

    const existing = nosModules.find(m => m.device.id === device.id);
    
    if (existing) {
      if (existing.device?.gatt?.connected) {
        setScanStatus("Dieses Nos-Modul ist bereits verbunden", "green");
        return true;
      }
    
      await reconnectNosModule(existing);
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
      slot: null,
      lastStatus: "",
      reconnecting: false   // 🔥 neu
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

  const module = nosModules.find(m => m.id === deviceId);
  if (!module) return;

  renderNosModuleList();
  setScanStatus("Nos-Verbindung verloren – reconnect…", "yellow");

  reconnectNosModule(module);
}

async function reconnectNosModule(module) {
  if (!module || module.reconnecting) return;

  module.reconnecting = true;
  console.log("Nos Reconnect starte:", module.name);

  try {
    await sleep(RECONNECT_DELAY);

    const server = await module.device.gatt.connect();
    const service = await server.getPrimaryService(NOS_BLE.serviceUuid);
    const ctrlChar = await service.getCharacteristic(NOS_BLE.ctrlUuid);
    const statChar = await service.getCharacteristic(NOS_BLE.statUuid);

    module.server = server;
    module.service = service;
    module.ctrlChar = ctrlChar;
    module.statChar = statChar;

    await setupNosNotifications(module);

    // 🔄 Status holen
    await sendToNosModule(module, "STATUS");
    await sleep(80);
    
    // 🔥 RunMode + Parameter wiederherstellen
    await sendToNosModule(module, `RUNMODE=${state.runMode.mode}`);
    await sleep(80);
    
    if (state.runMode.mode === "NO_CATCHUP" || state.runMode.mode === "YES_CATCHUP") {
      await sendToNosModule(module, `BASE=${state.runMode.baseSec}`);
      await sleep(80);
    }
    
    if (state.runMode.mode === "YES_CATCHUP") {
      await sendToNosModule(module, `C=${state.runMode.catchupC}`);
      await sleep(80);
    }
    
    // danach erst fertig
    module.reconnecting = false;

    renderNosModuleList();
    setScanStatus(`${nosModules.length} Nos-Modul(e) verbunden`, "green");

    await syncNosModuleState(module);

  } catch (err) {
    console.warn("Nos Reconnect fehlgeschlagen:", err);

    module.reconnecting = false;

    setTimeout(() => reconnectNosModule(module), 3000);
  }
}

async function syncNosModuleState(module) {
  if (!module.device?.gatt?.connected) return;

  await sleep(80);

  if (state.mode === "run") {
    await sendToNosModule(module, "PASS=OFF");
    await sleep(80);
    await sendToNosModule(module, "MODE=RUN");
    return;
  }

  if (state.mode === "delayed") {
    await sendToNosModule(module, `DSTART=${state.delayedStart.drivers},${state.delayedStart.laps}`);
    return;
  }

  // OFF
  await sendToNosModule(module, "PASS=OFF");
  await sleep(80);
  await sendToNosModule(module, "RESET");
  await sleep(80);
  await sendToNosModule(module, "MODE=IDLE");
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

function setBoxStatus(text, color) {
  const statusText = document.getElementById("boxStatusText");
  const dot = document.getElementById("boxStatusDot");

  if (statusText) statusText.textContent = text;

  if (dot) {
    dot.classList.remove("green", "yellow");
    dot.classList.add(color);
  }
}

function renderBoxModuleList() {
  const list = document.getElementById("boxModuleList");
  if (!list) return;

  if (boxModules.length === 0) {
    list.textContent = "Keine Box-Module verbunden.";
    return;
  }

  list.innerHTML = boxModules
    .map((module, index) => {
      const connected = module.device?.gatt?.connected ? "verbunden" : "getrennt";
      const slotText = module.slot ? `Slot ${module.slot}` : "Slot unbekannt";
      const displayName = module.slot ? boxDisplayName(module.slot) : `Box ${index + 1}`;
      return `${displayName}: ${slotText} · ${connected}`;
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

async function connectBoxModule() {
  if (!navigator.bluetooth) {
    alert("Web Bluetooth wird auf diesem Gerät oder Browser nicht unterstützt.");
    setBoxStatus("Web Bluetooth nicht unterstützt", "yellow");
    return false;
  }

  try {
    setBoxStatus("Box-Modul auswählen ...", "yellow");

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: BOX_BLE.name }],
      optionalServices: [BOX_BLE.serviceUuid]
    });

    const existing = boxModules.find(m => m.id === device.id);

    if (existing) {
      if (existing.device?.gatt?.connected) {
        setBoxStatus("Bereits verbunden", "green");
        return true;
      } else {
        // reconnect nutzen
        await reconnectBoxModule(existing);
        return true;
      }
    }

    device.addEventListener("gattserverdisconnected", () => {
      handleBoxDisconnected(device.id);
    });

    setBoxStatus("Verbinde mit Box-Modul ...", "yellow");

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BOX_BLE.serviceUuid);
    const ctrlChar = await service.getCharacteristic(BOX_BLE.ctrlUuid);
    const statChar = await service.getCharacteristic(BOX_BLE.statUuid);

    const module = {
      id: device.id,
      name: device.name || "Box-Control",
      device,
      server,
      service,
      ctrlChar,
      statChar,
      slot: null,
      lastStatus: "",
      lastStatusAt: 0,
      statusBuffer: ""
    };

    const assignedSlot = nextFreeBoxSlot();
    if (!assignedSlot) throw new Error("Kein freier Box-Slot verfügbar");
    module.slot = assignedSlot;

    boxModules.push(module);

    await setupBoxNotifications(module);
    await assignBoxSlot(module);
    await requestBoxStatus(module);

    renderBoxModuleList();
    setBoxStatus(`${boxModules.length} Box-Modul(e) verbunden`, "green");

    return true;
  } catch (error) {
    console.error("Box BLE Verbindung fehlgeschlagen:", error);
    setBoxStatus("Box-Verbindung fehlgeschlagen", "yellow");
    return false;
  }
}

async function setupBoxNotifications(module) {
  if (!module?.statChar) return;

  try {
    await module.statChar.startNotifications();

    module.statChar.addEventListener("characteristicvaluechanged", event => {
      const value = event.target.value;
      const text = new TextDecoder().decode(value);

      const statusText = accumulateBoxStatus(module, text);
      module.lastStatus = statusText;

      console.log(`BOX STATUS [${module.name}]:`, statusText);
      handleBoxStatus(module, statusText);
    });
  } catch (error) {
    console.warn("Box Notifications konnten nicht aktiviert werden:", error);
  }
}

function handleBoxStatus(module, text) {
  module.lastStatusAt = Date.now();
  const data = parseStatusLine(text);

  if (data.ERR) {
    const reasons = {
      NAME_INVALID: "Name konnte nicht gespeichert werden.",
      DETECT_INVALID: "Ungültiges Sensor-Preset.",
      DIST_INVALID: "Ungültige Sensor-Distanz."
    };
    module.lastError = data.REASON ? `${reasons[data.ERR] || data.ERR} (${data.REASON})` : (reasons[data.ERR] || data.ERR);
    setBoxSettingsStatus(module.lastError, "error");
    return;
  }

  const reportedSlot = Number(data.SLOT);
  if (Number.isInteger(reportedSlot) && reportedSlot >= 1 && reportedSlot <= 4) {
    module.slot = reportedSlot;
  }

  const slot = module.slot;

  if (slot >= 1 && slot <= 4) {
    const box = state.boxes.find(b => b.slot === slot);

    if (box) {
      box.online = true;

      if (data.NAME) box.name = normalizeBoxName(data.NAME) || "BOX";

      const preset = Number(data.DETECT);
      const distance = Number(data.DIST);
      if (Number.isInteger(preset) && preset >= 0 && preset <= 2 &&
          Number.isInteger(distance) && distance >= 3 && distance <= 10) {
        box.detection = { preset, distance };
        box.detectionDraft = { ...box.detection };
      }

      if (data.G && data.K && data.L && data.W) {
        box.params = {
          G: Number(data.G),
          K: Number(data.K),
          L: Number(data.L),
          W: Number(data.W)
        };

        box.draft = { ...box.params };
      }
    }
  }

  renderBoxTable();
  renderBoxModuleList();
  setBoxStatus(`${boxModules.length} Box-Modul(e) verbunden`, "green");
}

function parseStatusLine(text) {
  const data = {};

  String(text || "")
    .split(/[;\r\n]+/)
    .forEach(part => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex < 1) return;

      const key = part.slice(0, separatorIndex).trim().toUpperCase();
      const value = part.slice(separatorIndex + 1).trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(key) && value !== "") {
        data[key] = value;
      }
    });

  return data;
}

function accumulateBoxStatus(module, chunk) {
  const text = String(chunk || "").replace(/\0/g, "").trim();
  if (!text) return module.statusBuffer || "";

  // Neue Firmware beginnt mit FW=, ältere Statuszeilen üblicherweise mit SLOT=.
  // Bei einem solchen Anfang startet eine neue Statusmeldung; andere Chunks werden
  // an den Puffer angehängt, weil lange BLE-Werte fragmentiert eintreffen können.
  if (/^(?:FW|SLOT|ERR|EVT)\s*=/i.test(text)) {
    module.statusBuffer = text;
  } else {
    module.statusBuffer = `${module.statusBuffer || ""}${text}`;
  }

  // Schutz gegen einen unbeschränkt wachsenden Puffer bei unerwarteten Meldungen.
  if (module.statusBuffer.length > 1024) {
    module.statusBuffer = module.statusBuffer.slice(-1024);
  }

  return module.statusBuffer;
}

async function sendToBoxModule(module, command) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(command);

    await module.ctrlChar.writeValue(data);

    console.log(`BOX SEND [${module.name}]:`, command);
    return true;
  } catch (error) {
    console.error(`Box senden fehlgeschlagen [${module.name}]:`, error);
    return false;
  }
}

function nextFreeBoxSlot() {
  for (let slot = 1; slot <= 4; slot += 1) {
    if (!boxModules.some(module => module.slot === slot)) return slot;
  }
  return null;
}

async function assignBoxSlot(module) {
  if (!module?.slot || module.slot < 1 || module.slot > 4) return false;

  const assigned = await sendToBoxModule(module, `SLOT=${module.slot}`);
  if (assigned) await sleep(150);
  return assigned;
}

async function requestBoxStatus(module) {
  if (!module?.statChar || !module?.device?.gatt?.connected) return false;

  module.statusBuffer = "";
  const sent = await sendToBoxModule(module, "STATUS");
  if (!sent) return false;

  // Die neue Statuszeile kann größer als eine BLE-Notification sein. Chrome
  // erhält dann je nach ausgehandelter MTU nur den Anfang. Ein anschließender
  // GATT-Read lädt den vollständigen Characteristic-Wert (Long Read) nach.
  await sleep(120);
  try {
    const value = await module.statChar.readValue();
    const text = new TextDecoder().decode(value);
    if (text) {
      const statusText = accumulateBoxStatus(module, text);
      module.lastStatus = statusText;
      handleBoxStatus(module, statusText);
    }
  } catch (error) {
    // Alte Firmware/Characteristics können Read ablehnen. In diesem Fall
    // bleibt die bereits empfangene Notification weiterhin gültig.
    console.warn(`Box-Status konnte nicht vollständig gelesen werden [${module.name}]:`, error);
  }

  return true;
}

function handleBoxDisconnected(deviceId) {
  console.log("Box-Modul getrennt:", deviceId);

  const module = boxModules.find(m => m.id === deviceId);
  if (!module) return;

  // UI aktualisieren
  if (module.slot) {
    const box = state.boxes.find(b => b.slot === module.slot);
    if (box) box.online = false;
  }

  renderBoxTable();
  renderBoxModuleList();
  setBoxStatus("Verbindung verloren – reconnect…", "yellow");

  // 🔥 NICHT entfernen!
  reconnectBoxModule(module);
}

async function reconnectBoxModule(module) {
  if (!module || module.reconnecting) return;

  module.reconnecting = true;
  console.log("Reconnect starte:", module.name);

  try {
    await sleep(RECONNECT_DELAY);

    if (!module.device) throw new Error("Kein Device");

    const server = await module.device.gatt.connect();
    const service = await server.getPrimaryService(BOX_BLE.serviceUuid);
    const ctrlChar = await service.getCharacteristic(BOX_BLE.ctrlUuid);
    const statChar = await service.getCharacteristic(BOX_BLE.statUuid);

    module.server = server;
    module.service = service;
    module.ctrlChar = ctrlChar;
    module.statChar = statChar;

    await setupBoxNotifications(module);
    await assignBoxSlot(module);
    await requestBoxStatus(module);

    module.reconnecting = false;

    console.log("Reconnect erfolgreich:", module.name);
    setBoxStatus("Reconnect erfolgreich", "green");

  } catch (err) {
    console.warn("Reconnect fehlgeschlagen:", err);

    module.reconnecting = false;

    // 🔁 retry
    setTimeout(() => reconnectBoxModule(module), 3000);
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
  const module = boxModules.find(m => m.slot === slot && m.device?.gatt?.connected);

  if (!module) {
    setBoxStatus(`Box ${slot} ist nicht verbunden`, "yellow");
    return;
  }

  const ok = await sendToBoxModule(module, `CFG=${params.G},${params.K},${params.L},${params.W}`);

  if (ok) {
    setBoxStatus(`Parameter an Box ${slot} gesendet`, "green");
    await sleep(80);
    await requestBoxStatus(module);
  } else {
    setBoxStatus(`Senden an Box ${slot} fehlgeschlagen`, "yellow");
  }
}

async function commandSendAllBoxes(params) {
  let successCount = 0;

  for (const module of boxModules) {
    if (!module.slot || !module.device?.gatt?.connected) continue;

    const ok = await sendToBoxModule(module, `CFG=${params.G},${params.K},${params.L},${params.W}`);
    if (ok) successCount += 1;

    await sleep(80);
    await requestBoxStatus(module);
    await sleep(80);
  }

  if (successCount > 0) {
    setBoxStatus(`Parameter an ${successCount} Box-Modul(e) gesendet`, "green");
  } else {
    setBoxStatus("Keine verbundenen Box-Module gefunden", "yellow");
  }
}

async function commandSearchAndRead() {
  const connected = await connectNosModule();
  if (!connected) return;

  await sendCommand("STATUS");
}

document.addEventListener("DOMContentLoaded", () => {
  const v = document.getElementById("appVersion");
  if (v) v.textContent = APP_VERSION;

  setupNosConnectButton();
  setupBoxConnectButton();
  setupModeButtons();
  setupDelayedStartModal();
  setupNosSettingsModal();
  setupChampionsMode();
  setupBoxSettings();
  renderDelayedStartUI();

  // Box-Tabelle testweise zuletzt
  renderBoxTable();
});

function setupNosConnectButton() {
  const button = document.getElementById("connectNosButton");

  if (!button) {
    console.error("connectNosButton nicht gefunden");
    return;
  }

  button.addEventListener("click", async () => {
    await connectNosModule();
  });
}

function setupBoxConnectButton() {
  const button = document.getElementById("connectBoxButton");

  if (!button) {
    console.error("connectBoxButton nicht gefunden");
    return;
  }

  button.addEventListener("click", async () => {
    await connectBoxModule();
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

function setupNosSettingsModal() {
  const openButton = document.getElementById("openNosSettingsButton");
  const closeButton = document.getElementById("closeNosSettingsButton");
  const modal = document.getElementById("nosSettingsModal");
  const applyButton = document.getElementById("nosSettingsApplyButton");

  const baseRange = document.getElementById("baseSecRange");
  const catchupRange = document.getElementById("catchupCRange");

  if (openButton) {
    openButton.addEventListener("click", openNosSettingsModal);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeNosSettingsModal);
  }

  if (modal) {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeNosSettingsModal();
    });
  }

  document.querySelectorAll("[data-runmode]").forEach(button => {
    button.addEventListener("click", () => {
      state.runMode.mode = button.dataset.runmode;
      renderNosSettingsUI();
    });
  });

  if (baseRange) {
    baseRange.addEventListener("input", event => {
      state.runMode.baseSec = Number(event.target.value);
      renderNosSettingsUI();
    });
  }

  if (catchupRange) {
    catchupRange.addEventListener("input", event => {
      state.runMode.catchupC = Number(event.target.value);
      renderNosSettingsUI();
    });
  }

  if (applyButton) {
    applyButton.addEventListener("click", async () => {
      await applyNosRunModeSettings();
      closeNosSettingsModal();
    });
  }
}

function openNosSettingsModal() {
  const modal = document.getElementById("nosSettingsModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderNosSettingsUI();
}

function closeNosSettingsModal() {
  const modal = document.getElementById("nosSettingsModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderNosSettingsUI() {
  const mode = state.runMode.mode;
  const base = state.runMode.baseSec;
  const c = state.runMode.catchupC;

  const baseRange = document.getElementById("baseSecRange");
  const baseValue = document.getElementById("baseSecValue");
  const catchupRange = document.getElementById("catchupCRange");
  const catchupValue = document.getElementById("catchupCValue");
  const catchupSection = document.getElementById("catchupSection");
  const hint = document.getElementById("runModeHint");

  if (baseRange) baseRange.value = base;
  if (baseValue) baseValue.textContent = base;
  if (catchupRange) catchupRange.value = c;
  if (catchupValue) catchupValue.textContent = c;

  document.querySelectorAll("[data-runmode]").forEach(button => {
    button.classList.toggle("active", button.dataset.runmode === mode);
  });

  if (catchupSection) {
    catchupSection.style.display = mode === "YES_CATCHUP" ? "block" : "none";
  }

  if (hint) {
    if (mode === "NO_CATCHUP") {
      hint.textContent = `Jeder für sich: Limit bleibt fix bei ${base}s. Keine Aufholmechanik.`;
    } else if (mode === "YES_CATCHUP") {
      const halfUp = Math.ceil(c / 2);
      hint.textContent = `Aufholmechanik: Base ${base}s. Alle ${c} roten Intervalle +1s; bei Grün -${halfUp}.`;
    } else {
      hint.textContent = "Legacy: Standardmodus. Base ist firmwareseitig 3s, Aufholen alle 8 roten Intervalle.";
    }
  }
}

async function applyNosRunModeSettings() {
  const mode = state.runMode.mode;
  const base = state.runMode.baseSec;
  const c = state.runMode.catchupC;

  await sendCommand(`RUNMODE=${mode}`);
  await sleep(80);

  if (mode === "NO_CATCHUP" || mode === "YES_CATCHUP") {
    await sendCommand(`BASE=${base}`);
    await sleep(80);
  }

  if (mode === "YES_CATCHUP") {
    await sendCommand(`C=${c}`);
    await sleep(80);
  }

  await sendCommand("STATUS");
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

  boxModules
  .filter(module => module.slot >= 1 && module.device?.gatt?.connected)
  .forEach(module => {
    const box = state.boxes.find(b => b.slot === module.slot);
    if (!box) return;

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
    <td><button class="send-button send-slot-${box.slot}">${boxDisplayName(box.slot)}</button></td>
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

function setupChampionsMode() {
  const openButton = document.getElementById("openChampionsButton");
  const closeButton = document.getElementById("closeChampionsButton");
  const modal = document.getElementById("championsModal");
  const prepareButton = document.getElementById("championsPrepareButton");
  const sendButton = document.getElementById("championsSendButton");
  const editButton = document.getElementById("championsEditButton");
  const resetButton = document.getElementById("championsResetButton");

  openButton?.addEventListener("click", openChampionsMode);
  closeButton?.addEventListener("click", closeChampionsMode);
  modal?.addEventListener("click", event => {
    if (event.target === modal && !state.champions.sending) closeChampionsMode();
  });
  prepareButton?.addEventListener("click", prepareChampionsChanges);
  sendButton?.addEventListener("click", sendChampionsChanges);
  editButton?.addEventListener("click", () => {
    state.champions.proposedChanges = [];
    renderChampionsMode();
  });
  resetButton?.addEventListener("click", () => {
    if (!confirm("Ergebnisgeschichte wirklich zurücksetzen?")) return;
    localStorage.removeItem(CHAMPIONS_HISTORY_KEY);
    state.champions.proposedChanges = [];
    renderChampionsMode();
  });
}

function openChampionsMode() {
  const modal = document.getElementById("championsModal");
  if (!modal) return;

  const connectedSlots = getConnectedBoxSlots();
  const preserved = state.champions.orderedSlots.filter(slot => connectedSlots.includes(slot));
  state.champions.orderedSlots = [
    ...preserved,
    ...connectedSlots.filter(slot => !preserved.includes(slot))
  ];
  state.champions.proposedChanges = [];

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderChampionsMode();

  connectedSlots.forEach(slot => {
    const module = boxModules.find(item => item.slot === slot && item.device?.gatt?.connected);
    if (module) requestBoxStatus(module);
  });
}

function closeChampionsMode() {
  if (state.champions.sending) return;
  document.getElementById("championsModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function getConnectedBoxSlots() {
  return boxModules
    .filter(module => module.slot >= 1 && module.slot <= 4 && module.device?.gatt?.connected)
    .map(module => module.slot)
    .filter((slot, index, slots) => slots.indexOf(slot) === index);
}

function moveChampionSlot(index, direction) {
  if (state.champions.proposedChanges.length || state.champions.sending) return;
  const target = index + direction;
  if (target < 0 || target >= state.champions.orderedSlots.length) return;
  const ordered = state.champions.orderedSlots;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  renderChampionsMode();
}

function renderChampionsMode() {
  const ranking = document.getElementById("championsRanking");
  const empty = document.getElementById("championsEmpty");
  const preview = document.getElementById("championsPreview");
  const prepareButton = document.getElementById("championsPrepareButton");
  const sendButton = document.getElementById("championsSendButton");
  const editButton = document.getElementById("championsEditButton");
  const historyCount = document.getElementById("championsHistoryCount");
  const resetButton = document.getElementById("championsResetButton");
  if (!ranking || !preview) return;

  const slots = state.champions.orderedSlots;
  const changes = state.champions.proposedChanges;
  empty?.classList.toggle("hidden", slots.length >= 2);
  ranking.classList.toggle("hidden", slots.length < 2 || changes.length > 0);
  ranking.innerHTML = "";

  slots.forEach((slot, index) => {
    const box = state.boxes.find(item => item.slot === slot);
    if (!box) return;
    const item = document.createElement("li");
    item.className = "champions-rank-item";
    item.innerHTML = `
      <span class="champions-place">${index + 1}.</span>
      <span class="champions-box"><strong>${boxDisplayName(slot)}</strong><small>Position ${slot} · ${formatBoxParams(box.params)}</small></span>
      <span class="champions-move">
        <button aria-label="Box ${slot} nach oben" ${index === 0 ? "disabled" : ""}>↑</button>
        <button aria-label="Box ${slot} nach unten" ${index === slots.length - 1 ? "disabled" : ""}>↓</button>
      </span>`;
    const moveButtons = item.querySelectorAll("button");
    moveButtons[0].addEventListener("click", () => moveChampionSlot(index, -1));
    moveButtons[1].addEventListener("click", () => moveChampionSlot(index, 1));
    ranking.appendChild(item);
  });

  preview.classList.toggle("hidden", changes.length === 0);
  preview.innerHTML = changes.map(change => `
    <div class="champions-change" data-champions-slot="${change.slot}">
      <div><strong>${change.placement}. · ${boxDisplayName(change.slot)}</strong><span class="champions-send-state"></span></div>
      <div class="champions-values"><span>Alt ${formatBoxParams(change.old)}</span><b>→</b><span>Neu ${formatBoxParams(change.new)}</span></div>
    </div>`).join("");

  prepareButton?.classList.toggle("hidden", changes.length > 0);
  if (prepareButton) prepareButton.disabled = slots.length < 2 || state.champions.sending;
  sendButton?.classList.toggle("hidden", changes.length === 0);
  editButton?.classList.toggle("hidden", changes.length === 0);
  if (sendButton) sendButton.disabled = state.champions.sending;
  if (editButton) editButton.disabled = state.champions.sending;

  const history = getChampionsHistory();
  if (historyCount) historyCount.textContent = history.length;
  if (resetButton) resetButton.disabled = history.length === 0 || state.champions.sending;
}

function formatBoxParams(params) {
  return `G${params.G} K${params.K} L${params.L} W${params.W}`;
}

function getChampionsHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(CHAMPIONS_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function storeChampionsResult(placements) {
  const history = getChampionsHistory();
  history.push({ id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), placements });
  localStorage.setItem(CHAMPIONS_HISTORY_KEY, JSON.stringify(history.slice(-40)));
}

function placementImpact(index, count) {
  if (count === 4) return [2, 1, -1, -2][index];
  if (count === 3) return [2, 0, -2][index];
  if (count === 2) return [2, -2][index];
  return 0;
}

function championsHistoryScore(slot, history) {
  return history.slice(-10).reduce((score, entry) => {
    const index = entry.placements.indexOf(slot);
    return index < 0 ? score : score + placementImpact(index, entry.placements.length);
  }, 0);
}

function championsPlacementStreak(slot, placementIndex, history) {
  let streak = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].placements.indexOf(slot) !== placementIndex) break;
    streak += 1;
  }
  return streak;
}

function adjustChampionsKL(params, worsens) {
  const options = [];
  if (worsens) {
    if (params.K + 1 < params.L && params.K < 9) options.push("K");
    if (params.L < 10) options.push("L");
  } else {
    if (params.K > 1) options.push("K");
    if (params.L > 2 && params.L - 1 > params.K) options.push("L");
  }
  if (!options.length) return;
  const key = options[Math.floor(Math.random() * options.length)];
  params[key] += worsens ? 1 : -1;
}

function balancedChampionsParameters(current, slot, placementIndex, participantCount, history) {
  const impact = placementImpact(placementIndex, participantCount);
  const result = { ...current };
  if (!impact) return result;

  const worsens = impact > 0;
  const strong = Math.abs(impact) === 2;
  const score = championsHistoryScore(slot, history);
  const streak = championsPlacementStreak(slot, placementIndex, history);
  const historyReinforces = (worsens && score > 0) || (!worsens && score < 0);

  let wSteps = strong && Math.random() < 0.5 ? 2 : 1;
  if (historyReinforces && Math.abs(score) >= 5) wSteps = 2;
  const oldW = result.W;
  result.W = Math.max(0, Math.min(90, result.W + (worsens ? 10 * wSteps : -10 * wSteps)));

  const secondaryChance = Math.min(90,
    (strong ? 45 : 18) +
    (historyReinforces ? Math.min(30, Math.abs(score) * 3) : 0) +
    Math.min(24, streak * 8));
  if (Math.random() * 100 < secondaryChance) adjustChampionsKL(result, worsens);

  const mayAdjustG = strong && historyReinforces && (streak >= 2 || Math.abs(score) >= 8);
  if (mayAdjustG && Math.random() < 0.55) {
    result.G = Math.max(1, Math.min(20, result.G + (worsens ? 1 : -1)));
  }

  if (strong && sameBoxParams(result, current)) {
    if (oldW === result.W) adjustChampionsKL(result, worsens);
    if (sameBoxParams(result, current)) {
      result.G = Math.max(1, Math.min(20, result.G + (worsens ? 1 : -1)));
    }
  }
  return result;
}

function sameBoxParams(left, right) {
  return ["G", "K", "L", "W"].every(key => left[key] === right[key]);
}

function normalizeBoxName(rawValue) {
  return String(rawValue || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function boxDisplayName(slot) {
  const box = state.boxes.find(item => item.slot === Number(slot));
  const name = normalizeBoxName(box?.name);
  return !name || name === "BOX" ? `BOX ${slot}` : name;
}

function setupBoxSettings() {
  const openButton = document.getElementById("openBoxSettingsButton");
  const closeButton = document.getElementById("closeBoxSettingsButton");
  const modal = document.getElementById("boxSettingsModal");

  openButton?.addEventListener("click", openBoxSettings);
  closeButton?.addEventListener("click", closeBoxSettings);
  modal?.addEventListener("click", event => {
    if (event.target === modal) closeBoxSettings();
  });
}

function openBoxSettings() {
  const modal = document.getElementById("boxSettingsModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  renderBoxSettings();
  getConnectedBoxSlots().forEach(slot => {
    const module = boxModules.find(item => item.slot === slot && item.device?.gatt?.connected);
    if (module) requestBoxStatus(module);
  });
}

function closeBoxSettings() {
  document.getElementById("boxSettingsModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function setBoxSettingsStatus(text, type = "") {
  const status = document.getElementById("boxSettingsStatus");
  if (!status) return;
  status.textContent = text;
  status.style.color = type === "success" ? "var(--success)" :
    type === "error" ? "var(--warning)" : "var(--text-soft)";
}

function renderBoxSettings() {
  renderBoxNameSettings();
  renderSensorSettings();
}

function renderBoxNameSettings() {
  const container = document.getElementById("boxNameSettings");
  if (!container) return;
  const slots = getConnectedBoxSlots();

  if (!slots.length) {
    container.innerHTML = '<div class="box-settings-empty">Kein BoxModul verbunden.</div>';
    return;
  }

  container.innerHTML = "";
  slots.forEach(slot => {
    const box = state.boxes.find(item => item.slot === slot);
    const row = document.createElement("div");
    row.className = "box-name-row";
    row.innerHTML = `
      <span class="box-name-label"><strong>Position ${slot}</strong><small>Gespeichert: ${boxDisplayName(slot)}</small></span>
      <input class="box-name-input" maxlength="4" value="${normalizeBoxName(box?.name) || "BOX"}" aria-label="Name für Box ${slot}" />
      <button class="box-name-save" aria-label="Name für Box ${slot} speichern">✓</button>`;
    const input = row.querySelector("input");
    const button = row.querySelector("button");
    input.addEventListener("input", () => {
      input.value = normalizeBoxName(input.value);
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") saveBoxName(slot, input.value, input, button);
    });
    button.addEventListener("click", () => saveBoxName(slot, input.value, input, button));
    container.appendChild(row);
  });
}

async function saveBoxName(slot, rawName, input, button) {
  const name = normalizeBoxName(rawName);
  if (!name) {
    setBoxSettingsStatus("Bitte mindestens einen Buchstaben eingeben.", "error");
    return;
  }

  const module = boxModules.find(item => item.slot === slot && item.device?.gatt?.connected);
  if (!module) {
    setBoxSettingsStatus(`Box ${slot} ist nicht verbunden.`, "error");
    return;
  }

  input.disabled = true;
  button.disabled = true;
  module.lastError = "";
  const statusBefore = module.lastStatusAt || 0;
  setBoxSettingsStatus(`Name ${name} wird an Position ${slot} gesendet …`);

  const sent = await sendToBoxModule(module, `NAME=${name}`);
  if (sent) {
    await sleep(150);
    await requestBoxStatus(module);
  }

  const confirmed = sent && await waitForBoxState(module, 2500, () => {
    const box = state.boxes.find(item => item.slot === slot);
    return module.lastStatusAt > statusBefore && normalizeBoxName(box?.name) === name;
  });

  input.disabled = false;
  button.disabled = false;
  if (confirmed) {
    setBoxSettingsStatus(`${name} wurde dauerhaft gespeichert.`, "success");
    renderBoxTable();
    renderBoxModuleList();
    renderBoxSettings();
  } else {
    setBoxSettingsStatus(module.lastError || "Keine Bestätigung vom BoxModul erhalten.", "error");
  }
}

function detectionPresetTitle(value) {
  return Number(value) === 0 ? "Früh" : Number(value) === 2 ? "Spät" : "Normal";
}

function renderSensorSettings() {
  const tbody = document.getElementById("sensorSettingsBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const slots = getConnectedBoxSlots();

  tbody.appendChild(createSensorRow(null, "Alle", state.allDetectionDraft));
  slots.forEach(slot => {
    const box = state.boxes.find(item => item.slot === slot);
    if (box) tbody.appendChild(createSensorRow(slot, boxDisplayName(slot), box.detectionDraft));
  });
}

function createSensorRow(slot, title, draft) {
  const row = document.createElement("tr");
  const box = slot ? state.boxes.find(item => item.slot === slot) : null;
  const presetDraft = Boolean(box && draft.preset !== box.detection.preset);
  const distanceDraft = Boolean(box && draft.distance !== box.detection.distance);
  row.innerHTML = `
    <td><button class="sensor-send-button">${title}</button></td>
    <td><select class="sensor-select ${presetDraft ? "draft" : ""}" data-sensor-key="preset">
      ${[0, 1, 2].map(value => `<option value="${value}" ${draft.preset === value ? "selected" : ""}>${detectionPresetTitle(value)}</option>`).join("")}
    </select></td>
    <td><select class="sensor-select ${distanceDraft ? "draft" : ""}" data-sensor-key="distance">
      ${Array.from({ length: 8 }, (_, index) => index + 3).map(value => `<option value="${value}" ${draft.distance === value ? "selected" : ""}>${value} cm</option>`).join("")}
    </select></td>`;

  row.querySelectorAll("select").forEach(select => {
    select.addEventListener("change", event => {
      const key = event.target.dataset.sensorKey;
      const value = Number(event.target.value);
      if (slot) box.detectionDraft[key] = value;
      else state.allDetectionDraft[key] = value;
      renderSensorSettings();
    });
  });

  row.querySelector("button").addEventListener("click", async () => {
    if (slot) {
      await sendBoxDetection(slot, { ...box.detectionDraft });
    } else {
      if (!getConnectedBoxSlots().length) {
        setBoxSettingsStatus("Kein BoxModul verbunden.", "error");
        return;
      }
      if (getConnectedBoxSlots().length > 1 && !confirm("Die individuellen Sensor-Einstellungen aller BoxModule überschreiben?")) return;
      await sendAllBoxDetection({ ...state.allDetectionDraft });
    }
  });
  return row;
}

async function sendBoxDetection(slot, settings, quiet = false) {
  const module = boxModules.find(item => item.slot === slot && item.device?.gatt?.connected);
  if (!module) return false;
  const statusBefore = module.lastStatusAt || 0;
  if (!quiet) setBoxSettingsStatus(`Sensor-Einstellung wird an ${boxDisplayName(slot)} gesendet …`);

  if (!await sendToBoxModule(module, `DETECT=${settings.preset}`)) return false;
  await sleep(80);
  if (!await sendToBoxModule(module, `DIST=${settings.distance}`)) return false;
  await sleep(250);
  await requestBoxStatus(module);

  const confirmed = await waitForBoxState(module, 2000, () => {
    const box = state.boxes.find(item => item.slot === slot);
    return module.lastStatusAt > statusBefore && box?.detection.preset === settings.preset && box?.detection.distance === settings.distance;
  });

  if (confirmed) {
    const box = state.boxes.find(item => item.slot === slot);
    box.detectionDraft = { ...box.detection };
  }
  if (!quiet) {
    setBoxSettingsStatus(confirmed ? `Sensor-Einstellung für ${boxDisplayName(slot)} bestätigt.` : `Keine Bestätigung von ${boxDisplayName(slot)}.`, confirmed ? "success" : "error");
    renderSensorSettings();
  }
  return confirmed;
}

async function sendAllBoxDetection(settings) {
  const slots = getConnectedBoxSlots();
  setBoxSettingsStatus(`Sensor-Einstellung wird an ${slots.length} BoxModule gesendet …`);
  let confirmed = 0;
  for (const slot of slots) {
    if (await sendBoxDetection(slot, settings, true)) confirmed += 1;
  }
  setBoxSettingsStatus(`Sensor-Einstellung: ${confirmed}/${slots.length} bestätigt.`, confirmed === slots.length ? "success" : "error");
  renderSensorSettings();
}

async function waitForBoxState(module, timeoutMs, predicate) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(120);
  }
  return false;
}

function prepareChampionsChanges() {
  const orderedSlots = state.champions.orderedSlots;
  if (orderedSlots.length < 2 || state.champions.sending) return;
  const history = getChampionsHistory();
  state.champions.proposedChanges = orderedSlots.map((slot, index) => {
    const box = state.boxes.find(item => item.slot === slot);
    const old = { ...box.params };
    return {
      slot,
      placement: index + 1,
      old,
      new: balancedChampionsParameters(old, slot, index, orderedSlots.length, history),
      status: "idle"
    };
  });
  renderChampionsMode();
}

async function sendChampionsChanges() {
  const changes = state.champions.proposedChanges;
  if (!changes.length || state.champions.sending) return;
  state.champions.sending = true;
  storeChampionsResult(state.champions.orderedSlots);
  renderChampionsMode();

  for (const change of changes) {
    change.status = "sending";
    renderChampionSendState(change);
    change.status = await sendChampionChange(change) ? "confirmed" : "failed";
    renderChampionSendState(change);
  }

  state.champions.sending = false;
  renderChampionsMode();
}

function renderChampionSendState(change) {
  const row = document.querySelector(`[data-champions-slot="${change.slot}"]`);
  const status = row?.querySelector(".champions-send-state");
  if (!status) return;
  status.textContent = change.status === "sending" ? "Wird gesendet …" :
    change.status === "confirmed" ? "Bestätigt" :
    change.status === "failed" ? "Keine Antwort" : "";
  status.className = `champions-send-state ${change.status}`;
}

async function sendChampionChange(change) {
  const module = boxModules.find(item => item.slot === change.slot && item.device?.gatt?.connected);
  if (!module) return false;
  const statusBefore = module.lastStatusAt || 0;

  if (!await sendToBoxModule(module, "MODE=IDLE")) return false;
  await sleep(250);
  if (!await sendToBoxModule(module, `CFG=${change.new.G},${change.new.K},${change.new.L},${change.new.W}`)) return false;
  await sleep(300);
  await requestBoxStatus(module);

  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const box = state.boxes.find(item => item.slot === change.slot);
    if (module.lastStatusAt > statusBefore && box && sameBoxParams(box.params, change.new)) {
      box.draft = { ...change.new };
      renderBoxTable();
      return true;
    }
    await sleep(200);
  }
  return false;
}
