document.addEventListener("DOMContentLoaded", async () => {
  const fleetGrid                    = document.getElementById("fleet-grid");
  const dedicatedPageTimeDisplay     = document.getElementById("single-sensor-latest-time");
  const dedicatedPageIntervalDisplay = document.getElementById("single-sensor-interval");

  // ==========================================================================
  // STORAGE HELPERS
  // "aic_custom_cards"  → user-added cards   [{ id, sensorId, name, description }]
  // "aic_fleet_overrides" → edits to CONFIG.FLEET cards  { [fleetId]: { name, description } }
  // ==========================================================================
  const CARDS_KEY     = "aic_custom_cards";
  const OVERRIDES_KEY = "aic_fleet_overrides";

  function loadCustomCards()    { try { return JSON.parse(localStorage.getItem(CARDS_KEY))     || [];  } catch { return []; } }
  function saveCustomCards(c)   { localStorage.setItem(CARDS_KEY, JSON.stringify(c)); }
  function loadFleetOverrides() { try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY)) || {};  } catch { return {}; } }
  function saveFleetOverrides(o){ localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o)); }

  // ==========================================================================
  // 3-DOT MENU — single global open reference
  // ==========================================================================
  let currentOpenMenu = null;

  function closeAllMenus() {
    if (currentOpenMenu) { currentOpenMenu.classList.remove("open"); currentOpenMenu = null; }
  }
  document.addEventListener("click", closeAllMenus);

  // ==========================================================================
  // PHASE 1: Build card elements
  //
  // cardConfig shape expected by this function:
  //   { sensorId, name, description, id?, isFleet? }
  //
  // Fleet cards  → isFleet = true,  id = the CONFIG.FLEET device id
  // Custom cards → isFleet = false, id = "custom_<timestamp>"
  //
  // Both get the 3-dot menu; fleet cards only show Edit (no Delete).
  // ==========================================================================
  function buildCardElement(cardConfig) {
    const { sensorId, name, description, id, isFleet } = cardConfig;

    const card = document.createElement("a");
    card.className = "card";
    card.setAttribute("data-sensor-id", sensorId);
    card.href = `sensor.html?sensor=${sensorId}`;

    card.innerHTML = `
      <h3 style="font-size: 1.25rem; font-weight: 700; padding-right: 2rem;">
        ${name}
      </h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.25rem 0 1.5rem 0;">
        ${description}
      </p>
      <span class="latest-sync-time" style="font-size: 0.85rem; color: var(--text-muted); margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--bg-input);">
        Synchronizing clock...
      </span>
    `;

    // ── 3-dot menu (all cards) ──────────────────────────────────────────────
    const menuWrap = document.createElement("div");
    menuWrap.className = "card-menu-wrap";

    const menuBtn = document.createElement("button");
    menuBtn.className = "card-menu-btn";
    menuBtn.setAttribute("aria-label", "Card options");
    menuBtn.setAttribute("title", "Options");
    menuBtn.innerHTML = "&#8942;"; // ⋮

    const dropdown = document.createElement("div");
    dropdown.className = "card-dropdown";

    // Edit item — present on every card
    const editItem = document.createElement("button");
    editItem.className = "card-dropdown-item";
    editItem.innerHTML = `<span>✎</span> Edit`;
    editItem.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllMenus();
      openEditModal(cardConfig);
    });
    dropdown.appendChild(editItem);

    // Delete item — custom cards only
    // Fleet cards are hardcoded in app.js; deleting them from the DOM
    // would just bring them back on the next page load, which is confusing.
    if (!isFleet) {
      const deleteItem = document.createElement("button");
      deleteItem.className = "card-dropdown-item danger";
      deleteItem.innerHTML = `<span>✕</span> Delete`;
      deleteItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllMenus();
        if (confirm(`Remove "${name}" from the dashboard?`)) {
          saveCustomCards(loadCustomCards().filter(c => c.id !== id));
          initializeDashboardLayout();
          fetchLiveFleetTelemetry();
        }
      });
      dropdown.appendChild(deleteItem);
    }

    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const alreadyOpen = menuWrap.classList.contains("open");
      closeAllMenus();
      if (!alreadyOpen) { menuWrap.classList.add("open"); currentOpenMenu = menuWrap; }
    });

    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(dropdown);
    card.appendChild(menuWrap);

    return card;
  }

  function initializeDashboardLayout() {
    if (!fleetGrid) return;
    fleetGrid.innerHTML = "";

    const overrides = loadFleetOverrides();

    // Fleet cards — apply any saved name/description overrides
    CONFIG.FLEET.forEach(device => {
      const ov = overrides[device.id] || {};
      fleetGrid.appendChild(buildCardElement({
        id:          device.id,
        sensorId:    device.id,          // fleet sensorId = device.id
        name:        ov.name        || device.name,
        description: ov.description || (device.location ? `Zone: ${device.location}` : ""),
        isFleet:     true,
      }));
    });

    // User-added custom cards
    loadCustomCards().forEach(device => {
      fleetGrid.appendChild(buildCardElement({
        id:          device.id,
        sensorId:    device.sensorId,
        name:        device.name,
        description: device.description,
        isFleet:     false,
      }));
    });
  }

  // ==========================================================================
  // PHASE 2: Live telemetry polling
  // ==========================================================================
  async function fetchLiveFleetTelemetry() {
    if (!fleetGrid) return;
    for (const card of document.querySelectorAll(".card[data-sensor-id]")) {
      const sensorId  = card.getAttribute("data-sensor-id");
      const timeLabel = card.querySelector(".latest-sync-time");
      if (!sensorId || !timeLabel) continue;
      try {
        const res  = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor=${sensorId}`);
        const data = await res.json();
        timeLabel.innerText = (data.latest_reading && data.latest_reading !== "No data available")
          ? `Last updated: ${new Date(data.latest_reading).toLocaleString()}`
          : "Status: Offline / No Records";
      } catch {
        timeLabel.innerText = "Status: Connection Offline";
      }
    }
  }

  async function updateDedicatedPageStatus() {
    if (!dedicatedPageTimeDisplay) return;
    const sensorId = new URLSearchParams(window.location.search).get("sensor") || "esp32_office_1";
    try {
      const res  = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor=${sensorId}`);
      const data = await res.json();
      if (dedicatedPageIntervalDisplay && data.command_interval) {
        dedicatedPageIntervalDisplay.innerText = `${data.command_interval} Minutes`;
      }
      dedicatedPageTimeDisplay.innerText = (data.latest_reading && data.latest_reading !== "No data available")
        ? new Date(data.latest_reading).toLocaleString()
        : "No Historical Entry";
    } catch {
      dedicatedPageTimeDisplay.innerText = "Offline";
    }
  }

  // ==========================================================================
  // PHASE 3: MODAL — shared Add / Edit
  // editingTarget: null              → Add mode
  // editingTarget: { ...cardConfig } → Edit mode
  // ==========================================================================
  const overlay      = document.getElementById("sensor-modal-overlay");
  const modalTitle   = document.getElementById("modal-title");
  const closeBtn     = document.getElementById("modal-close-btn");
  const cancelBtn    = document.getElementById("modal-cancel-btn");
  const saveBtn      = document.getElementById("modal-save-btn");
  const addBtn       = document.getElementById("add-sensor-btn");
  const sensorSelect = document.getElementById("modal-sensor-select");
  const nameInput    = document.getElementById("modal-name-input");
  const descInput    = document.getElementById("modal-desc-input");

  let editingTarget = null;

  if (overlay && addBtn) {

    function closeModal() { overlay.classList.add("hidden"); editingTarget = null; }

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeModal();
    });

    async function populateSensorDropdown(preselect = null) {
      sensorSelect.innerHTML = `<option value="" disabled selected>Loading sensor IDs from sheet...</option>`;
      try {
        const res  = await fetch(`${CONFIG.API_BASE_URL}?action=getSensorIds`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          sensorSelect.innerHTML = `<option value="" disabled selected>No sensor data found in sheet</option>`;
          return;
        }
        sensorSelect.innerHTML = `<option value="" disabled>Select a sensor ID…</option>`;
        data.forEach(id => {
          const opt = document.createElement("option");
          opt.value = id; opt.textContent = id;
          if (preselect && id === preselect) opt.selected = true;
          sensorSelect.appendChild(opt);
        });
        if (!preselect) sensorSelect.options[0].selected = true;
      } catch {
        sensorSelect.innerHTML = `<option value="" disabled selected>Could not reach backend</option>`;
      }
    }

    // ── Open ADD ──
    addBtn.addEventListener("click", () => {
      editingTarget          = null;
      modalTitle.textContent = "Add Sensor Card";
      saveBtn.textContent    = "Save Card";
      nameInput.value        = "";
      descInput.value        = "";
      overlay.classList.remove("hidden");
      populateSensorDropdown();
      nameInput.focus();
    });

    // ── Open EDIT (called by card dropdown) ──
    function openEditModal(cardConfig) {
      editingTarget          = cardConfig;
      modalTitle.textContent = "Edit Sensor Card";
      saveBtn.textContent    = "Save Changes";
      nameInput.value        = cardConfig.name;
      descInput.value        = cardConfig.description || "";
      overlay.classList.remove("hidden");
      populateSensorDropdown(cardConfig.sensorId);
      nameInput.focus();
    }
    window._openEditModal = openEditModal;

    // ── Save ──
    saveBtn.addEventListener("click", () => {
      const selectedSensorId = sensorSelect.value;
      const name             = nameInput.value.trim();
      const description      = descInput.value.trim();

      sensorSelect.style.borderColor = "";
      nameInput.style.borderColor    = "";

      if (!selectedSensorId) { sensorSelect.style.borderColor = "var(--danger)"; sensorSelect.focus(); return; }
      if (!name)             { nameInput.style.borderColor    = "var(--danger)"; nameInput.focus();    return; }

      if (editingTarget === null) {
        // ── ADD ──
        const customCards = loadCustomCards();
        const allIds = [...CONFIG.FLEET.map(d => d.id), ...customCards.map(c => c.sensorId)];
        if (allIds.includes(selectedSensorId)) {
          alert(`A card for "${selectedSensorId}" already exists on the dashboard.`); return;
        }
        customCards.push({ id: `custom_${Date.now()}`, sensorId: selectedSensorId, name, description: description || `Sensor: ${selectedSensorId}` });
        saveCustomCards(customCards);

      } else if (editingTarget.isFleet) {
        // ── EDIT FLEET CARD ──
        // Sensor ID of fleet cards is fixed (it's the hardware ID in app.js).
        // Only name and description are persisted as an override in localStorage.
        // The sensorId dropdown is shown but locked to the fleet device's own ID;
        // we silently ignore any change to it since fleet IDs come from firmware.
        const overrides = loadFleetOverrides();
        overrides[editingTarget.id] = { name, description: description || editingTarget.description };
        saveFleetOverrides(overrides);

      } else {
        // ── EDIT CUSTOM CARD ──
        const customCards = loadCustomCards();
        const otherIds = [
          ...CONFIG.FLEET.map(d => d.id),
          ...customCards.filter(c => c.id !== editingTarget.id).map(c => c.sensorId)
        ];
        if (otherIds.includes(selectedSensorId)) {
          alert(`A card for "${selectedSensorId}" already exists on the dashboard.`); return;
        }
        saveCustomCards(customCards.map(c => c.id !== editingTarget.id ? c : { ...c, sensorId: selectedSensorId, name, description: description || `Sensor: ${selectedSensorId}` }));
      }

      closeModal();
      initializeDashboardLayout();
      fetchLiveFleetTelemetry();
    });
  }

  // ==========================================================================
  // EXECUTION & POLLING PIPELINE
  // ==========================================================================
  initializeDashboardLayout();

  setInterval(async () => {
    await Promise.all([fetchLiveFleetTelemetry(), updateDedicatedPageStatus()]);
  }, 30000);

  Promise.all([fetchLiveFleetTelemetry(), updateDedicatedPageStatus()])
    .catch(err => console.error("[Initial Load] Boot fetch failure:", err));
});