document.addEventListener("DOMContentLoaded", async () => {
  const archiveTable = document.getElementById("archive-table-body");
  const latestReadingDisplay = document.getElementById("latest-reading-time"); // 1. Hook for Step 1.2
  
  // ==========================================================================
  // PIPELINE A: Fetch and Display Latest Sensor Metadata (Step 1.2)
  // ==========================================================================
  async function fetchLatestSensorStatus() {
    if (!latestReadingDisplay) return; // Skip silently if this page element isn't present
    
    try {
      // Fetch the latest system metrics dynamically from your Google Apps Script
      const response = await fetch(`${CONFIG.API_BASE_URL}?action=getConfig&sensor_id=esp32_office_1`);
      const data = await response.json();
      
      if (data.latest_reading && data.latest_reading !== "No data available") {
        const lastReadDate = new Date(data.latest_reading);
        const formattedTime = lastReadDate.toLocaleString(); // e.g., "6/15/2026, 9:15 AM"
        
        latestReadingDisplay.innerText = `Latest System Sync: ${formattedTime}`;
      } else {
        latestReadingDisplay.innerText = "Latest System Sync: No recent data available";
      }
    } catch (error) {
      console.error("Failed to append latest sensor status indicators:", error);
      latestReadingDisplay.innerText = "Latest System Sync: Connection Timeout";
    }
  }

  // ==========================================================================
  // PIPELINE B: Fetch and Build Historical Spreadsheet Archives
  // ==========================================================================
  async function loadArchiveTable() {
    if (!archiveTable) return;

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}?action=getArchives`);
      const files = await response.json();

      if (files.length === 0) {
        archiveTable.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:2rem;">No historical archives found.</td></tr>`;
        return;
      }

      archiveTable.innerHTML = "";

      files.forEach(file => {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid var(--bg-input)";
        
        row.innerHTML = `
          <td style="padding: 1rem 0; font-weight: 500;">${file.name}</td>
          <td style="padding: 1rem 0; color: var(--text-muted); font-size: 0.9rem;">${file.size || "Unknown Size"}</td>
          <td style="padding: 1rem 0; text-align: right;">
            <a href="${file.downloadUrl}" download="${file.name}" target="_blank" class="btn" style="text-decoration:none; font-size:0.85rem;">Download CSV</a>
          </td>
        `;
        archiveTable.appendChild(row);
      });

    } catch (error) {
      archiveTable.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--danger); padding:2rem;">Error reaching long-term archive repository.</td></tr>`;
    }
  }

  // Execute both data pipelines on initialization
  fetchLatestSensorStatus();
  loadArchiveTable();
});