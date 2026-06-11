AIC Hardware Web Integration

A modular IOT website that can connect ESP32 to the internet. Can monitor a large amount of ESP32s with their own sensors. 

System Architecture
* **Edge Firmware:** ESP32 + DHT22 making stateless HTTPS POST requests.
* **Cloud Backend & Datastore:** Google Apps Script Web App acting as the API layer, logging to Google Sheets, and archiving data to Google Drive.
* **Frontend Web Application:** Vanilla JS layout optimized with Chart.js and deployed on Vercel.

Repository Map
* `index.html`: The landing hub displaying all active devices in the network.
* `sensor.html`: Dynamic visualization layout. Interprets URL parameters to render custom charts.
* `archive.html`: Long-term file storage portal connecting directly to your Google Drive downloads.
* `js/app.js`: Centralized environment config. **Update your Google Apps Script Web App URL here.**

Dynamic Routing Engine
To view analytics for a specific device, append the target ID to your browser address bar using URL parameters:

Future Updates
- Agentic AI may be used for diagnostic applications and data analysis.