document.addEventListener("DOMContentLoaded", async () => {
  const fleetGrid                  = document.getElementById("fleet-grid");
  const dedicatedPageTimeDisplay   = document.getElementById("single-sensor-latest-time");
  const dedicatedPageIntervalDisplay = document.getElementById("single-sensor-interval");

  // ==========================================================================
  // STORAGE HELPERS
  // Key: "aic_custom_cards"
  // Schema: [{ id, sensorId, name, description }]
  // ==========================================================================
  const STORAGE_KEY = "aic_custom_cards";

  function loadCustomCards() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveCustomCards(cards) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }

  // ==========================================================================
  // 3-DOT MENU — one global open reference so only one menu is open at a time
  // ==========================================================================
  let currentOpenMenu = null;

  function closeAllMenus() {
    if (currentOpenMenu) {
      currentOpenMenu.classList.remove("open");
      currentOpenMenu = null;
    }
  }

  // Close any open menu when clicking elsewhere on the page
  document.addEventListener("click", closeAllMenus);

  // ==========================================================================
  // PHASE 1: Build card elements
  // ==========================================================================
  function buildCardElement(device, isCustom = false) {
    const sensorId = device.sensorId || device.id;

    const card = document.createElement("a");
    card.className = "card";
    card.setAttribute("data-sensor-id", sensorId);
    card.href = `sensor.html?sensor=${sensorId}`;

    card.innerHTML = `
      <h3 style="font-size: 1.25rem; font-weight: 700; padding-right: ${isCustom ? "2rem" : "0"};">
        ${device.name}
      </h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.25rem 0 1.5rem 0;">
        ${device.description || (device.location ? `Zone: ${device.location}` : "")}
      </p>
      <span class="latest-sync-time" style="font-size: 0.85rem; color: var(--text-muted); margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--bg-input);">
        Synchronizing clock...
      </span>
    `;

    // Only custom cards get the 3-dot menu
    if (isCustom) {
      const menuWrap = document.createElement("div");
      menuWrap.className = "card-menu-wrap";

      // ── Trigger button (three dots) ──
      const menuBtn = document.createElement("button");
      menuBtn.className = "card-menu-btn";
      menuBtn.setAttribute("aria-label", "Card options");
      menuBtn.setAttribute("title", "Options");
      menuBtn.innerHTML = "&#8942;"; // vertical ellipsis ⋮

      // ── Dropdown panel ──
      const dropdown = document.createElement("div");
      dropdown.className = "card-dropdown";

      // Edit option
      const editItem = document.createElement("button");
      editItem.className = "card-dropdown-item";
      editItem.innerHTML = `<span>✎</span> Edit`;
      editItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllMenus();
        openEditModal(device);
      });

      // Delete option
      const deleteItem = document.createElement("button");
      deleteItem.className = "card-dropdown-item danger";
      deleteItem.innerHTML = `<span>✕</span> Delete`;
      deleteItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllMenus();
        if (confirm(`Remove "${device.name}" from the dashboard?`)) {
          const cards = loadCustomCards().filter(c => c.id !== device.id);
          saveCustomCards(cards);
          initializeDashboardLayout();
          fetchLiveFleetTelemetry();
        }
      });

      dropdown.appendChild(editItem);
      dropdown.appendChild(deleteItem);

      // Toggle menu open/closed on dot-button click
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isAlreadyOpen = menuWrap.classList.contains("open");
        closeAllMenus();

        if (!isAlreadyOpen) {
          menuWrap.classList.add("open");
          currentOpenMenu = menuWrap;
        }
      });

      menuWrap.appendChild(menuBtn);
      menuWrap.appendChild(dropdown);
      card.appendChild(menuWrap);
    }

    return card;
  }

  function initializeDashboardLayout() {
    if (!fleetGrid) return;
    fleetGrid.innerHTML = "";

    CONFIG.FLEET.forEach(device => {
      fleetGrid.appendChild(buildCardElement(device, false));
    });

    loadCustomCards().forEach(device => {
      fleetGrid.appendChild(buildCardElement(device, true));
    });
  }

  // ==========================================================================
  // PHASE 2: Live telemetry polling
  // ==========================================================================
  async function fetchLiveFleetTelemetry() {
    if (!fleetGrid) return;

    const cards = document.querySelectorAll(".card[data-sensor-id]");
    for (const card of cards) {
      const sensorId  = card.getAttribute("data-sensor-id");
      const timeLabel = card.querySelector(".latest-sync-time");
      if (!sensorId || !timeLabel) continue;

      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor=${sensorId}`);
        const data     = await response.json();

        if (data.latest_reading && data.latest_reading !== "No data available") {
          timeLabel.innerText = `Last updated: ${new Date(data.latest_reading).toLocaleString()}`;
        } else {
          timeLabel.innerText = "Status: Offline / No Records";
        }
      } catch (err) {
        console.error(`Connection failure for node ${sensorId}:`, err);
        timeLabel.innerText = "Status: Connection Offline";
      }
    }
  }

  async function updateDedicatedPageStatus() {
    if (!dedicatedPageTimeDisplay) return;

    const urlParams = new URLSearchParams(window.location.search);
    const sensorId  = urlParams.get("sensor") || "esp32_office_1";

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor=${sensorId}`);
      const data     = await response.json();

      if (dedicatedPageIntervalDisplay && data.command_interval) {
        dedicatedPageIntervalDisplay.innerText = `${data.command_interval} Minutes`;
      }

      if (data.latest_reading && data.latest_reading !== "No data available") {
        dedicatedPageTimeDisplay.innerText = new Date(data.latest_reading).toLocaleString();
      } else {
        dedicatedPageTimeDisplay.innerText = "No Historical Entry";
      }
    } catch (err) {
      console.error(`Metadata load failure for ${sensorId}:`, err);
      dedicatedPageTimeDisplay.innerText = "Offline";
    }
  }

  // ==========================================================================
  // PHASE 3: MODAL — shared for Add and Edit
  // editingId: null  → Add mode
  // editingId: string → Edit mode (the id of the card being edited)
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

  let editingId = null; // tracks which card is being edited, null = add mode

  if (overlay && addBtn) {

    // ── Close helpers ──
    function closeModal() {
      overlay.classList.add("hidden");
      editingId = null;
    }

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeModal();
    });

    // ── Populate sensor ID dropdown from Google Sheets ──
    async function populateSensorDropdown(preselect = null) {
      sensorSelect.innerHTML = `<option value="" disabled selected>Loading sensor IDs from sheet...</option>`;

      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}?action=getSensorIds`);
        const data     = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
          sensorSelect.innerHTML = `<option value="" disabled selected>No sensor data found in sheet</option>`;
          return;
        }

        sensorSelect.innerHTML = `<option value="" disabled>Select a sensor ID…</option>`;
        data.forEach(id => {
          const opt = document.createElement("option");
          opt.value       = id;
          opt.textContent = id;
          // Pre-select the current value when editing
          if (preselect && id === preselect) opt.selected = true;
          sensorSelect.appendChild(opt);
        });

        // If nothing matched the preselect, keep placeholder selected
        if (!preselect) sensorSelect.options[0].selected = true;

      } catch (err) {
        console.error("Failed to fetch sensor IDs:", err);
        sensorSelect.innerHTML = `<option value="" disabled selected>Could not reach backend</option>`;
      }
    }

    // ── Open in ADD mode ──
    addBtn.addEventListener("click", () => {
      editingId            = null;
      modalTitle.textContent = "Add Sensor Card";
      saveBtn.textContent    = "Save Card";
      nameInput.value        = "";
      descInput.value        = "";
      overlay.classList.remove("hidden");
      populateSensorDropdown();
      nameInput.focus();
    });

    // ── Open in EDIT mode (called from the card's Edit dropdown item) ──
    function openEditModal(device) {
      editingId              = device.id;
      modalTitle.textContent = "Edit Sensor Card";
      saveBtn.textContent    = "Save Changes";
      nameInput.value        = device.name;
      descInput.value        = device.description || "";
      overlay.classList.remove("hidden");
      // Pre-select the sensor ID this card is currently bound to
      populateSensorDropdown(device.sensorId);
      nameInput.focus();
    }

    // Expose openEditModal so buildCardElement can reach it
    window._openEditModal = openEditModal;

    // ── Save (handles both Add and Edit) ──
    saveBtn.addEventListener("click", () => {
      const selectedSensorId = sensorSelect.value;
      const name             = nameInput.value.trim();
      const description      = descInput.value.trim();

      // Validate
      sensorSelect.style.borderColor = "";
      nameInput.style.borderColor    = "";

      if (!selectedSensorId) {
        sensorSelect.style.borderColor = "var(--danger)";
        sensorSelect.focus();
        return;
      }
      if (!name) {
        nameInput.style.borderColor = "var(--danger)";
        nameInput.focus();
        return;
      }

      let cards = loadCustomCards();

      if (editingId === null) {
        // ── ADD ──
        // Prevent duplicate sensor IDs across all cards
        const allSensorIds = [
          ...CONFIG.FLEET.map(d => d.id),
          ...cards.map(c => c.sensorId)
        ];
        if (allSensorIds.includes(selectedSensorId)) {
          alert(`A card for "${selectedSensorId}" already exists on the dashboard.`);
          return;
        }

        cards.push({
          id:          `custom_${Date.now()}`,
          sensorId:    selectedSensorId,
          name:        name,
          description: description || `Sensor: ${selectedSensorId}`,
        });

      } else {
        // ── EDIT ──
        // Allow the same sensorId if it hasn't changed; block if it collides with another card
        const allSensorIds = [
          ...CONFIG.FLEET.map(d => d.id),
          ...cards.filter(c => c.id !== editingId).map(c => c.sensorId)
        ];
        if (allSensorIds.includes(selectedSensorId)) {
          alert(`A card for "${selectedSensorId}" already exists on the dashboard.`);
          return;
        }

        cards = cards.map(c => {
          if (c.id !== editingId) return c;
          return {
            ...c,
            sensorId:    selectedSensorId,
            name:        name,
            description: description || `Sensor: ${selectedSensorId}`,
          };
        });
      }

      saveCustomCards(cards);
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
    console.log("[Auto-Sync] Background polling loop...");
    await Promise.all([fetchLiveFleetTelemetry(), updateDedicatedPageStatus()]);
  }, 30000);

  console.log("[Initial Load] Dispatching network requests...");
  Promise.all([fetchLiveFleetTelemetry(), updateDedicatedPageStatus()])
    .then(() => console.log("[Initial Load] First telemetry wave populated."))
    .catch(err => console.error("[Initial Load] Boot fetch failure:", err));
});