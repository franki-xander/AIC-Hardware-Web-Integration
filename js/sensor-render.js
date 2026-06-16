let tempChart = null;
let humidChart = null;
let currentSensorId = null;
let activeHours = 48;

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentSensorId = urlParams.get("sensor");

  if (!currentSensorId) {
    currentSensorId = "demo_node";
    window.history.replaceState(null, "", `${window.location.pathname}?sensor=${currentSensorId}`);
  }

  document.getElementById("display-sensor-id").textContent =
    currentSensorId === "demo_node"
      ? "Demo Sensor Page (Fake Sensor Page for Dev Purposes)"
      : currentSensorId;

  fetchTelemetryData(activeHours);

  document.querySelectorAll("[data-window]").forEach(button => {
    button.addEventListener("click", (e) => {
      document.querySelectorAll("[data-window]").forEach(b => b.classList.remove("btn-active"));
      e.target.classList.add("btn-active");
      activeHours = parseInt(e.target.getAttribute("data-window"));
      fetchTelemetryData(activeHours);
    });
  });

  const intervalForm = document.getElementById("interval-form");
  if (intervalForm) intervalForm.addEventListener("submit", handleIntervalUpdate);

  setInterval(() => {
    fetchTelemetryData(activeHours);
  }, 30000);
});

async function fetchTelemetryData(hours) {
  if (currentSensorId === "demo_node") {
    processAndRender(generateMockData(hours));
    return;
  }
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}?action=getData&sensor_id=${currentSensorId}&hours=${hours}`);
    const data = await response.json();
    if (data.length === 0) { updateMetricDisplays("---", "---", null); return; }
    processAndRender(data);
  } catch {
    processAndRender(generateMockData(hours));
  }
}

function processAndRender(data) {
  data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const latest = data[data.length - 1];
  updateMetricDisplays(latest.temperature, latest.humidity, latest.timestamp);
  renderCharts(
    data.map(r => new Date(r.timestamp)),
    data.map(r => r.temperature),
    data.map(r => r.humidity)
  );
}

function updateMetricDisplays(t, h, time) {
  document.getElementById("live-temp").textContent  = typeof t === "number" ? `${t.toFixed(1)}°C` : t;
  document.getElementById("live-humid").textContent = typeof h === "number" ? `${h.toFixed(1)}%`  : h;

  const timeEl = document.getElementById("single-sensor-latest-time");
  if (timeEl) timeEl.textContent = time ? `Last Sync: ${new Date(time).toLocaleString()}` : "Last Sync: No historical payload entry found";

  const dateBlock = document.getElementById("sync-date");
  const timeBlock = document.getElementById("sync-time");
  if (time) {
    const d = new Date(time);
    if (dateBlock) dateBlock.textContent = d.toLocaleDateString();
    if (timeBlock) timeBlock.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } else {
    if (dateBlock) dateBlock.textContent = "--/--/----";
    if (timeBlock) timeBlock.textContent = "--:--:--";
  }

  // Update the Current Interval display (value only — the "minutes" label is in HTML)
  const intervalDisplay = document.getElementById("single-sensor-interval");
  if (intervalDisplay && intervalDisplay.textContent === "—") {
    // dashboard.js updateDedicatedPageStatus() populates this on load;
    // we only overwrite the placeholder if it hasn't been set yet.
  }
}

function renderCharts(labels, tempPoints, humidPoints) {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: "time", grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
      y: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } }
    },
    plugins: { legend: { display: false } }
  };

  if (tempChart) {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = tempPoints;
    tempChart.update("none");
  } else {
    tempChart = new Chart(document.getElementById("tempChart").getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ data: tempPoints, borderColor: "#38bdf8", tension: 0.2, pointRadius: 1 }] },
      options: chartOptions
    });
  }

  if (humidChart) {
    humidChart.data.labels = labels;
    humidChart.data.datasets[0].data = humidPoints;
    humidChart.update("none");
  } else {
    humidChart = new Chart(document.getElementById("humidChart").getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ data: humidPoints, borderColor: "#4ade80", tension: 0.2, pointRadius: 1 }] },
      options: chartOptions
    });
  }
}

async function handleIntervalUpdate(e) {
  e.preventDefault();
  const inputVal = document.getElementById("interval-input").value;

  if (currentSensorId === "demo_node") {
    // Update the display immediately in demo mode
    const intervalDisplay = document.getElementById("single-sensor-interval");
    if (intervalDisplay) intervalDisplay.textContent = inputVal;
    alert(`Demo Mode: Simulated interval switch to ${inputVal} minutes.`);
    return;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}?action=setInterval&sensor_id=${currentSensorId}&value=${inputVal}`);
    const result   = await response.json();
    if (result.status === "updated") {
      // Reflect the new value in the Current Interval display immediately
      const intervalDisplay = document.getElementById("single-sensor-interval");
      if (intervalDisplay) intervalDisplay.textContent = inputVal;
      alert(`Success: Interval for ${currentSensorId} set to ${inputVal} minutes.`);
    }
  } catch {
    alert("Failed to sync structural interval settings with backend.");
  }
}

function generateMockData(hours) {
  const arr = [];
  const total = hours * 4;
  const now = new Date();
  for (let i = total; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 15 * 60 * 1000);
    const w = Math.sin(i * 0.1);
    arr.push({ timestamp: t.toISOString(), temperature: 24.5 + w * 3.2 + Math.random() * 0.4, humidity: 55.0 - w * 8.5 + Math.random() * 1.2 });
  }
  return arr;
}