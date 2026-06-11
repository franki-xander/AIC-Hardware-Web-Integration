document.addEventListener("DOMContentLoaded", async () => {
  const archiveTable = document.getElementById("archive-table-body");
  if (!archiveTable) return;

  try {
    // Request historical directory contents from Google Drive API bridge
    const response = await fetch(`${CONFIG.API_BASE_URL}?action=getArchives`);
    const files = await response.json();

    if (files.length === 0) {
      archiveTable.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:2rem;">No historical archives found.</td></tr>`;
      return;
    }

    archiveTable.innerHTML = "";

    // Loop and build clean download table layouts on the fly
    files.forEach(file => {
      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid var(--bg-input)";
      
      row.innerHTML = `
        <td style="padding: 1rem 0; font-weight: 500;">${file.name}</td>
        <td style="padding: 1rem 0; color: var(--text-muted); font-size: 0.9rem;">${file.size || "Unknown Size"}</td>
        <td style="padding: 1rem 0; text-align: right;">
          <a href="${file.downloadUrl}" target="_blank" class="btn" style="text-decoration:none; font-size:0.85rem;">Download CSV</a>
        </td>
      `;
      archiveTable.appendChild(row);
    });

  } catch (error) {
    archiveTable.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--danger); padding:2rem;">Error reaching long-term archive repository.</td></tr>`;
  }
});