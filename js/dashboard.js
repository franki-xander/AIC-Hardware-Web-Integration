document.addEventListener("DOMContentLoaded", async () => {
  // Target structural layout hooks
  const fleetGrid = document.getElementById("fleet-grid");
  const dedicatedPageTimeDisplay = document.getElementById("single-sensor-latest-time");
  const dedicatedPageIntervalDisplay = document.getElementById("single-sensor-interval");

  // ==========================================================================
  // PHASE 1: Build HTML Layout Blueprints (Runs EXACTLY Once on Load)
  // ==========================================================================
  function initializeDashboardLayout() {
    if (!fleetGrid) return;

    // Wipe out initializing placeholder text once
    fleetGrid.innerHTML = "";

    // Programmatically generate anchor elements using native .card classes
    CONFIG.FLEET.forEach(device => {
      const card = document.createElement("a");
      card.className = "card"; 
      card.setAttribute("data-sensor-id", device.id); 
      card.href = `sensor.html?sensor=${device.id}`;
      
      card.innerHTML = `
        <h3 style="font-size: 1.25rem; font-weight: 700;">${device.name}</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.25rem 0 1.5rem 0;">
          Zone: ${device.location}
        </p>
        <span class="latest-sync-time" style="font-size: 0.85rem; color: var(--text-muted); margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--bg-input);">
          Synchronizing clock...
        </span>
      `;
      fleetGrid.appendChild(card);
    });
  }

  // ==========================================================================
  // PHASE 2: Live Network Telemetry Sync Loops (Runs repeatedly on a timer)
  // ==========================================================================
  async function fetchLiveFleetTelemetry() {
    if (!fleetGrid) return;
    
    const mainMenuCards = document.querySelectorAll(".card[data-sensor-id]");
    
    for (const card of mainMenuCards) {
      const sensorId = card.getAttribute("data-sensor-id");
      const timeLabel = card.querySelector(".latest-sync-time");
      if (!sensorId || !timeLabel) continue;

      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor=${sensorId}`);
        const data = await response.json();

        if (data.latest_reading && data.latest_reading !== "No data available") {
          const lastReadDate = new Date(data.latest_reading);
          timeLabel.innerText = `Last updated: ${lastReadDate.toLocaleString()}`;
        } else {
          timeLabel.innerText = "Status: Offline / No Records";
        }
      } catch (error) {
        console.error(`Inbound connection tracking failure for node ${sensorId}:`, error);
        timeLabel.innerText = "Status: Connection Offline";
      }
    }
  }

  // Dedicated Singular Sensor Page View Handler
  async function updateDedicatedPageStatus() {
    if (!dedicatedPageTimeDisplay) return;

    const urlParams = new URLSearchParams(window.location.search);
    const sensorId = urlParams.get("sensor") || "esp32_office_1";

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor=${sensorId}`);
      const data = await response.json();

      if (dedicatedPageIntervalDisplay && data.command_interval) {
        dedicatedPageIntervalDisplay.innerText = `${data.command_interval} Minutes`;
      }

      if (data.latest_reading && data.latest_reading !== "No data available") {
        const lastReadDate = new Date(data.latest_reading);
        dedicatedPageTimeDisplay.innerText = lastReadDate.toLocaleString();
      } else {
        dedicatedPageTimeDisplay.innerText = "No Historical Entry";
      }
    } catch (error) {
      console.error(`Failed loading primary metadata for page target ${sensorId}:`, error);
      dedicatedPageTimeDisplay.innerText = "Offline";
    }
  }

  // ==========================================================================
  // EXECUTION & POLLING PIPELINE
  // ==========================================================================
  // 1. Setup layout frames instantly
  initializeDashboardLayout();

  // 2. Trigger immediate data population on launch
  await Promise.all([fetchLiveFleetTelemetry(), updateDedicatedPageStatus()]);

  // 3. 🟢 THE AUTO-REFRESH TRIGGER: Smooth background updates every 30 seconds
  setInterval(async () => {
    console.log("[Auto-Sync] Fetching latest cloud database records...");
    await Promise.all([fetchLiveFleetTelemetry(), updateDedicatedPageStatus()]);
  }, 30000); 
});