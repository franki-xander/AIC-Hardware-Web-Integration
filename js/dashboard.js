document.addEventListener("DOMContentLoaded", () => {
  const fleetGrid = document.getElementById("fleet-grid");
  if (!fleetGrid) return;

  // Clear any design placeholders
  fleetGrid.innerHTML = "";

  // Loop through our fleet configuration and construct interactive cards
  CONFIG.FLEET.forEach(sensor => {
    const card = document.createElement("a");
    card.href = `sensor?id=${sensor.id}`; // Matches Vercel's clean URLs
    card.className = "card";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.25rem; font-weight: 600;">${sensor.name}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem;">ID: ${sensor.id} | ${sensor.location}</p>
        </div>
        <span class="badge badge-online" id="status-${sensor.id}">Active</span>
      </div>
      <p style="font-size: 0.9rem; color: var(--accent); margin-top: auto;">View Analytics & Controls &rarr;</p>
    `;
    
    fleetGrid.appendChild(card);
  });
});