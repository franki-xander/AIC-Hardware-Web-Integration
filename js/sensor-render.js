let tempChart = null;
let humidChart = null;
let currentSensorId = null;

document.addEventListener("DOMContentLoaded", () => {
  // 1. Parse the URL string to extract the target sensor identity
  const urlParams = new URLSearchParams(window.location.search);
  
  // 🟢 FIXED: Changed from "id" to "sensor" to match your dashboard's URL format
  currentSensorId = urlParams.get("sensor");

  // If no ID is provided, gracefully downgrade to a dummy node instead of failing
  if (!currentSensorId) {
    currentSensorId = "demo_node";
    // 🟢 FIXED: Updated fallback query string to match unified format
    const cleanUrl = `${window.location.pathname}?sensor=${currentSensorId}`;
    window.history.replaceState(null, "", cleanUrl);
  }

  // Set the structural labels on the page
  let publicTitle = currentSensorId;

  if (currentSensorId === "demo_node") {
    publicTitle = "Demo Sensor Page (Fake Sensor Page for Dev Purposes)";
  }

  // Push the clean title to the HTML template
  document.getElementById("display-sensor-id").textContent = publicTitle;

  // 2. Initialize Telemetry Load (Defaulting to a 48-hour window)
  fetchTelemetryData(48);

  // 3. Set up Event Listeners for the Time Window Filters
  document.querySelectorAll("[data-window]").forEach(button => {
    button.addEventListener("click", (e) => {
      document.querySelectorAll("[data-window]").forEach(b => b.classList.remove("btn-active"));
      e.target.classList.add("btn-active");
      
      const hours = parseInt(e.target.getAttribute("data-window"));
      fetchTelemetryData(hours);
    });
  });

  // 4. Set up Event Listener for the Interval Update Submission
  const intervalForm = document.getElementById("interval-form");
  if (intervalForm) {
    intervalForm.addEventListener("submit", handleIntervalUpdate);
  }
});

/**
 * Communicates with Google Apps Script to fetch historical records,
 * or serves instant local mock data if the dummy sensor is active.
 */
async function fetchTelemetryData(hours) {
  if (currentSensorId === "demo_node") {
    const mockData = generateMockData(hours);
    processAndRender(mockData);
    return;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}?action=getData&sensor_id=${currentSensorId}&hours=${hours}`);
    const data = await response.json();
    
    if (data.length === 0) {
      updateMetricDisplays("---", "---", null); // 🟢 Added empty state parameter
      return;
    }

    processAndRender(data);

  } catch (error) {
    console.error("Critical error fetching data telemetry:", error);
    processAndRender(generateMockData(hours));
  }
}

/**
 * Universal layout mapping parsing engine
 */
function processAndRender(data) {
  // Sort chronologically by timestamp
  data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Pull the latest row entries for the real-time summary header cards
  const latestRecord = data[data.length - 1];
  
  // 🟢 FIXED: Added the record timestamp as a third argument to keep UI elements synced
  updateMetricDisplays(latestRecord.temperature, latestRecord.humidity, latestRecord.timestamp);

  // Prepare arrays for Chart.js parsing
  const timestamps = data.map(row => new Date(row.timestamp));
  const temperatures = data.map(row => row.temperature);
  const humidities = data.map(row => row.humidity);

  // Build or refresh visual charts
  renderCharts(timestamps, temperatures, humidities);
}
// EXTENDED: Accepts the time string and splits it across both date and time display targets
function updateMetricDisplays(t, h, time) {
  document.getElementById("live-temp").textContent = typeof t === "number" ? `${t.toFixed(1)}°C` : t;
  document.getElementById("live-humid").textContent = typeof h === "number" ? `${h.toFixed(1)}%` : h;

  // Header subtitle text indicator
  const timeElement = document.getElementById("single-sensor-latest-time");
  if (timeElement) {
    if (time) {
      const lastReadDate = new Date(time);
      timeElement.textContent = `Last Sync: ${lastReadDate.toLocaleString()}`;
    } else {
      timeElement.textContent = "Last Sync: No historical payload entry found";
    }
  }

  // 🟢 NEW: Extract separate Date and Time parameters for the centralized layout block
  const dateBlock = document.getElementById("sync-date");
  const timeBlock = document.getElementById("sync-time");
  
  if (time) {
    const lastReadDate = new Date(time);
    if (dateBlock) dateBlock.textContent = lastReadDate.toLocaleDateString();
    if (timeBlock) timeBlock.textContent = lastReadDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } else {
    if (dateBlock) dateBlock.textContent = "--/--/----";
    if (timeBlock) timeBlock.textContent = "--:--:--";
  }
}
/**
 * Instantiates and updates the dual decoupled Chart.js graph components
 */
function renderCharts(labels, tempPoints, humidPoints) {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'time', grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
      y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
    },
    plugins: { legend: { display: false } }
  };

  if (tempChart) {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = tempPoints;
    tempChart.update();
  } else {
    const ctx = document.getElementById("tempChart").getContext("2d");
    tempChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data: tempPoints, borderColor: "#38bdf8", tension: 0.2, pointRadius: 1 }] },
      options: chartOptions
    });
  }

  if (humidChart) {
    humidChart.data.labels = labels;
    humidChart.data.datasets[0].data = humidPoints;
    humidChart.update();
  } else {
    const ctx = document.getElementById("humidChart").getContext("2d");
    humidChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data: humidPoints, borderColor: "#4ade80", tension: 0.2, pointRadius: 1 }] },
      options: chartOptions
    });
  }
}

/**
 * Fires an outbound request back to Google to save a new transmission interval
 */
async function handleIntervalUpdate(e) {
  e.preventDefault();
  const inputVal = document.getElementById("interval-input").value;
  
  if (currentSensorId === "demo_node") {
    alert(`Demo Mode: Simulated interval switch to ${inputVal} minutes.`);
    return;
  }
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}?action=setInterval&sensor_id=${currentSensorId}&value=${inputVal}`);
    const result = await response.json();
    
    if (result.status === "updated") {
      alert(`Success: Interval for ${currentSensorId} set to ${inputVal} minutes.`);
    }
  } catch (error) {
    alert("Failed to sync structural interval settings with backend.");
  }
}

/**
 * Algorithmic generator that builds mathematically smooth simulation metrics
 */
function generateMockData(hours) {
  const mockArray = [];
  const totalPoints = hours * 4; // Simulated data entry every 15 minutes
  const now = new Date();

  for (let i = totalPoints; i >= 0; i--) {
    const timeOffset = new Date(now.getTime() - i * 15 * 60 * 1000);
    
    const waveFactor = Math.sin(i * 0.1);
    const simulatedTemp = 24.5 + (waveFactor * 3.2) + (Math.random() * 0.4);
    const simulatedHumid = 55.0 - (waveFactor * 8.5) + (Math.random() * 1.2);

    mockArray.push({
      timestamp: timeOffset.toISOString(),
      temperature: simulatedTemp,
      humidity: simulatedHumid
    });
  }
  return mockArray;
}